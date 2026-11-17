# PrivatePAY x402 MagicBlock P0 Fixes Integration Plan

**Last Updated:** 2026-11-17  
**Lambda Target:** `PrivateDAOAgentExchange-Function-N2zgpQmMN41S` (Stockholm, eu-north-1)  
**Repository:** `/home/x-pact/PrivateDAO-AGENT-EXCHANGE-UNIFIED`  
**Handler:** `exchange-runtime/src/handler.mjs` (7058 lines)

---

## Executive Summary

This integration plan adds three critical MagicBlock validation gates to the PrivatePAY x402 checkout flow. The current implementation fails because:

1. **Error 1:** "PRIVATE BALANCE READ: MagicBlock rejected this wallet's private-balance account query"
   - Root cause: Missing P0.1 delegation state validation
   - Impact: Account not delegated on target ER validator → private-balance queries fail
   
2. **Error 2:** "PRIVATE PAYMENT ERROR: MagicBlock rejected checkout creation (400)"
   - Root cause: Missing P0.2 PER ephemeral permission
   - Impact: Accounts lack permission to execute private transfers
   
3. **Error 3:** Transfer queue uninitialized for USDC on validator
   - Root cause: Missing P0.3 transfer queue check/init
   - Impact: Private transfers cannot queue transfers on the validator

All three errors are **non-fatal until proof-of-delegation**, meaning they require recovery before checkout proceeds. They are **sequential validation gates** — must complete in order, but can be cached per validator/payer pair for up to 30 minutes.

---

## Architecture: Where P0 Fits

```
┌─────────────────────────────────────────────────────────────┐
│ POST /api/privatepay/x402                                   │
│ POST /api/privatepay/x402/requirements (fresh challenge)    │
│ POST /api/privatepay/x402/checkout (merchant)               │
│ POST /api/privatepay/x402/prepare (wallet operation prep)   │
└─────────────────────────────────────────────────────────────┘
                          ↓
          ┌───────────────────────────────────┐
          │ ENTRY: createPrivatePayCheckout() │
          │ ENTRY: createPrivatePayRequirements() │
          └───────────────────────────────────┘
                          ↓
          ┌───────────────────────────────────────────┐
          │ NEW GATE: runMagicBlockP0Validations()    │
          │ ────────────────────────────────────────  │
          │ 1. P0.1: validateMagicBlockDelegationState│
          │    - Query ER endpoint: getDelegationStatus│
          │    - Verify: isDelegated=true              │
          │    - Verify: delegation_reference present │
          │    - Verify: account_owner ≠ delegation_pg│
          │                                            │
          │ 2. P0.2: setupPrivateEphemeralPermission  │
          │    - POST /per/ephemeral-permission/create│
          │    - Set expiry: now + 30 min              │
          │    - Mode: private_payment                 │
          │    - Max USDC: 500,000 (configurable)     │
          │                                            │
          │ 3. P0.3: ensureUsdcTransferQueueReady     │
          │    - GET /v1/spl/is-mint-initialized      │
          │    - POST /v1/spl/initialize-mint if needed│
          │    - Validate: initialized=true            │
          │                                            │
          │ On ANY gate failure: STOP, return 503     │
          │ (never proceed to actual checkout)         │
          └───────────────────────────────────────────┘
                          ↓
          ┌───────────────────────────────────┐
          │ PROCEED: Existing checkout logic  │
          │ (validation already complete)     │
          └───────────────────────────────────┘
```

---

## Exact Modification Points

### File: `exchange-runtime/src/handler.mjs`

#### Modification 1: Import the new validation module (Line ~52)

**Current state (line 52):**
```javascript
import { validateMagicBlockDelegationState, setupPrivateEphemeralPermission, ensureUsdcTransferQueueReady, runMagicBlockP0Validations } from "./privatepay-magicblock-validation.mjs";
```

**Status:** ✅ Already imported in the file. No change needed.

---

### File: `exchange-runtime/src/privatepay-magicblock-validation.mjs` (NEW FILE)

**Action:** Copy `/tmp/privatepay-magicblock-p0-fixes.mjs` to this location.

**Rationale:** Keeps MagicBlock validation logic isolated and testable.

---

### File: `exchange-runtime/src/privatepay.mjs`

#### Modification 2: Add P0 validations before checkout creation

**Location:** Inside `createPrivatePayCheckout()`, after input validation (around line 624), before the network request.

**Current code (lines 601–646):**
```javascript
export async function createPrivatePayCheckout(config, input = {}, fetchImpl = fetch) {
  assertMerchantCheckoutReady(config);
  const payer = String(input.payer || "").trim();
  if (!SOLANA_ADDRESS.test(payer))
    throw Object.assign(new Error("payer must be a valid Solana address"), { statusCode: 400, code: "PRIVATEPAY_INVALID_PAYER" });
  // ... more validation ...
  const body = { amount, cluster: MAGICBLOCK_PRIVATE_CLUSTER, description, resource, ... };
  const response = await fetchImpl(privatePayProviderUrl(config, "/v1/payments"), {
    method: "POST",
    headers: merchantHeaders(config),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  // ...
}
```

**NEW: Insert after line 624 (after amount validation, before body construction):**

```javascript
  // P0 GATE: Validate MagicBlock delegation, permission, and transfer queue readiness
  // This gate is fatal if ANY check fails; no partial recovery.
  try {
    const p0Result = await runMagicBlockP0Validations(
      config,
      payer,
      config.privatePayValidatorAddress || config.magicBlockTeePubkey,  // P0.1 validator param
      DEFAULT_PRIVATEPAY_TEE_RPC,                                        // P0.1 & P0.2 TEE URL
      config.privatePayFacilitatorApiKey                                 // P0.2 auth token
    );
    // All gates passed; proceed with checkout
  } catch (err) {
    // P0 gate failed: return 503 to signal validator/permission setup issue
    throw Object.assign(
      new Error(`P0 MagicBlock validation failed: ${err.message}`),
      { statusCode: 503, code: "PRIVATEPAY_MAGICBLOCK_P0_GATE_FAILED", cause: err }
    );
  }
```

**Why here:** Before any network call to MagicBlock, we must ensure the wallet's account is properly set up on the target ER validator.

---

#### Modification 3: Add P0 validations to `createPrivatePayRequirements()` (optional but recommended)

**Location:** Inside `createPrivatePayRequirements()`, after line 489 (after status check).

**Rationale:** This ensures even a read-only requirements query validates account setup.

**Insert after line 489:**
```javascript
  // P0 GATE (non-fatal for requirements): Early delegation check only
  // If delegation state is invalid, log warning but do not fail the requirements call
  // (the actual failure will occur at checkout or transfer time)
  if (isMagicBlockRail(config) && String(input.payer || "").trim()) {
    try {
      const delegationCheck = await validateMagicBlockDelegationState(
        DEFAULT_PRIVATEPAY_TEE_RPC,
        String(input.payer || "").trim(),
        config.privatePayValidatorAddress || config.magicBlockTeePubkey,
        5000
      );
      // Delegation valid; continue normally
    } catch (err) {
      // Log but do not fail; the full P0 gate will trigger at checkout
      console.warn(`[PrivatePAY] P0 delegation check (non-fatal): ${err.message}`);
    }
  }
```

**Status:** ⚠️ OPTIONAL. Include only if you want early warnings in requirements calls.

---

#### Modification 4: Import required functions at top of privatepay.mjs

**Current imports (line 1–12):**
```javascript
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import { parsePaymentPayload, parsePaymentRequirements } from "@x402/core/schemas";
// ... other imports ...
```

**ADD after existing imports:**
```javascript
import { validateMagicBlockDelegationState, setupPrivateEphemeralPermission, ensureUsdcTransferQueueReady, runMagicBlockP0Validations } from "./privatepay-magicblock-validation.mjs";
import { DEFAULT_PRIVATEPAY_TEE_RPC } from "./privatepay-mainnet.mjs";
```

**Note:** `DEFAULT_PRIVATEPAY_TEE_RPC` is already available in the file. Imports required for new functions.

---

## Configuration Requirements

The following config fields must be present or default correctly:

| Field | Default | Purpose | Where Read |
|-------|---------|---------|-----------|
| `privatePayValidatorAddress` | `config.magicBlockTeePubkey` | TEE validator pubkey for P0.1/P0.3 | P0 gates |
| `privatePayFacilitatorApiKey` | (from env/secret) | Bearer token for P0.2 | P0.2 function |
| `DEFAULT_PRIVATEPAY_TEE_RPC` | `"https://mainnet-private.magicblock.app"` | ER RPC endpoint for all P0 gates | privatepay-mainnet.mjs |

**Verification script location:** `/tmp/opencode/p0-fixes/test-p0-fixes.mjs` (validates config before deployment).

---

## Error Handling & Recovery

### P0.1: Delegation State Validation

| Error | Status Code | Recovery | Actionable By |
|-------|-------------|----------|---------------|
| Account not delegated | 403 | Wallet must re-delegate via base-layer delegateAccount | Wallet/user |
| getRpcDelegationStatus timeout | 503 | Retry P0 gate after 2s | Agent Exchange retry loop |
| ER endpoint unavailable | 503 | Wait for ER service recovery | Ops/monitoring |
| Invalid delegation_reference | 503 | Contact MagicBlock support | PrivateDAO support |

### P0.2: Ephemeral Permission Setup

| Error | Status Code | Recovery | Actionable By |
|-------|-------------|----------|---------------|
| Permission creation already exists | 200 | Skip (idempotent) | Automatic in validator |
| PER endpoint unavailable | 503 | Wait for ER service recovery | Ops/monitoring |
| Expiry in past | 400 | Ensure server time is synchronized | DevOps |
| Auth token invalid | 401 | Refresh facilitator credential in Secrets Manager | PrivateDAO ops |

### P0.3: Transfer Queue Initialization

| Error | Status Code | Recovery | Actionable By |
|-------|-------------|----------|---------------|
| Already initialized | 200 | Skip initialization, use existing queue | Automatic |
| Initialization required but fails | 503 | Retry with exponential backoff | Agent Exchange retry |
| USDC mint mismatch | 400 | Verify config.usdcMint matches ER configuration | DevOps |
| ER endpoint unreachable | 503 | Wait for ER recovery | Ops/monitoring |

---

## Deployment Sequence

### Step 1: File Preparation (5 min)

1. Copy `/tmp/privatepay-magicblock-p0-fixes.mjs` → `exchange-runtime/src/privatepay-magicblock-validation.mjs`
2. Add imports to `privatepay.mjs` (lines after 12)
3. Insert P0.2 in `createPrivatePayCheckout()` (after line 624)
4. (Optional) Insert P0 warning in `createPrivatePayRequirements()` (after line 489)

### Step 2: Local Testing (10 min)

```bash
cd /home/x-pact/PrivateDAO-AGENT-EXCHANGE-UNIFIED/exchange-runtime
node /tmp/opencode/p0-fixes/test-p0-fixes.mjs
```

Expected output: All mock validations pass without live calls.

### Step 3: Syntax & Build Verification (5 min)

```bash
npm run lint
npm run typecheck
node --check src/handler.mjs
node --check src/privatepay.mjs
node --check src/privatepay-magicblock-validation.mjs
```

### Step 4: Package Lambda Artifact (5 min)

```bash
npm run build
zip -r deployment-package.zip .
sha256sum deployment-package.zip > deployment-package.zip.sha256
```

### Step 5: Canary Deployment (30 min)

1. Deploy to Lambda with explicit version tagging
2. Run 1 real checkout with 500k USDC (capped, dedicated payer)
3. Monitor CloudWatch logs for any P0 gate failures
4. Verify settlement signature finalized on TEE

### Step 6: Production Verification (10 min)

1. Re-run live requirements probe
2. Re-run live checkout challenge (no signature)
3. Verify MagicBlock status and merchant account delegation

---

## Rollback Plan

If P0 gates cause failures during canary:

### Immediate Rollback (5 min)

```bash
# If Lambda deployment was successful but P0 gates are blocking all checkouts:
aws lambda update-function-code \
  --region eu-north-1 \
  --function-name PrivateDAOAgentExchange-Function-N2zgpQmMN41S \
  --zip-file fileb://ROLLBACK_PREVIOUS_VERSION.zip
```

### Root Cause Analysis Points

1. **Are P0 gates too strict?**
   - Check if `isDelegated` query is correctly targeting the ER endpoint
   - Verify validator pubkey in P0.1 matches actual ER validator

2. **Is TEE URL incorrect?**
   - Verify `DEFAULT_PRIVATEPAY_TEE_RPC` points to mainnet-private, not devnet

3. **Are auth tokens missing/expired?**
   - Check AWS Secrets Manager `pdao/agent-exchange/facilitator` for valid API key
   - Verify token is not rate-limited or revoked

4. **Is transfer queue already initialized?**
   - Query ER directly: `GET /v1/spl/is-mint-initialized?mint=EPjFWdd5...&validator=...`
   - If yes, P0.3 should auto-skip

---

## Caching & Performance

The P0 gates should be cached at **PAYER + VALIDATOR** level:

- **TTL:** 30 minutes (checkout expiry + 5-min buffer)
- **Key:** `magicblock_p0_${payer}_${validator}_${Date.now() / 1000 / 1800}`
- **Store:** Redis (via config.store if available) or in-memory MemoryStore
- **Invalidation:** On P0 gate failure or explicit cache reset

**Rationale:** Prevents repeated validation calls for the same wallet within a checkout session.

```javascript
// Pseudocode (implement in privatepay-magicblock-validation.mjs)
const cacheKey = `p0_${payer}_${validator}`;
const cached = await cache.get(cacheKey);
if (cached && cached.expiresAt > Date.now()) {
  return cached.result;
}
// ... run P0 gates ...
await cache.set(cacheKey, { result, expiresAt: Date.now() + 1800000 });
```

---

## Metrics & Monitoring

### CloudWatch Metrics to Add

| Metric | Namespace | Unit | Trigger |
|--------|-----------|------|---------|
| `P0.1DelegationValidationTime` | PrivatePayMagicBlock | Milliseconds | On P0.1 completion |
| `P0.2PermissionSetupTime` | PrivatePayMagicBlock | Milliseconds | On P0.2 completion |
| `P0.3TransferQueueInitTime` | PrivatePayMagicBlock | Milliseconds | On P0.3 completion |
| `P0GatePassRate` | PrivatePayMagicBlock | Percent | On P0 completion (pass/total) |
| `P0GateFailureByType` | PrivatePayMagicBlock | Count | On P0 failure (dimension: P0.1/P0.2/P0.3) |

### Log Lines to Monitor

```
[PrivatePAY] P0.1: Validating MagicBlock delegation state...
[PrivatePAY] P0.1: Delegation valid <delegation_reference>
[PrivatePAY] P0.2: Creating PER ephemeral permission...
[PrivatePAY] P0.2: Permission created <permission_address>
[PrivatePAY] P0.3: Checking USDC transfer queue...
[PrivatePAY] P0.3: Transfer queue ready
[PrivatePAY] P0 ALL GATES PASSED: Ready for checkout
[PrivatePAY] ERROR: P0.1 failed: <error>
[PrivatePAY] ERROR: P0.2 failed: <error>
[PrivatePAY] ERROR: P0.3 failed: <error>
```

---

## Security Considerations

1. **No hardcoded validator ID:** Config must provide validator address; never assume a single validator.
2. **Auth token protection:** Bearer token is never logged; only status codes are recorded.
3. **Expiry validation:** P0.2 must enforce expiry in future; reject past expirations.
4. **Rate limiting:** P0 gates implement AbortSignal.timeout(5000) to prevent hanging.
5. **Idempotency:** P0.2 & P0.3 are safe to retry; skip if already initialized.

---

## Testing Checklist

- [ ] Local test script (`test-p0-fixes.mjs`) passes all mock scenarios
- [ ] Syntax check: `node --check` on all modified files
- [ ] TypeScript check: `npm run typecheck` passes
- [ ] Lint: `npm run lint` passes
- [ ] Build artifact: `npm run build` succeeds
- [ ] Canary: 1 real checkout with 500k USDC on dedicated payer
- [ ] Settlement: Verify TEE finality for canary transaction
- [ ] Rollback test: Verify rollback package restores prior behavior
- [ ] Monitoring: CloudWatch dashboard shows P0 metrics
- [ ] Documentation: Runbook and incident checklist reviewed

---

## References

- **MagicBlock Delegation:** `/home/x-pact/.config/opencode/skills/magicblock/references/delegation.md`
- **Private Payments API:** `/home/x-pact/.config/opencode/skills/magicblock/references/private-payments.md`
- **Ephemeral Accounts:** `/home/x-pact/.config/opencode/skills/magicblock/references/ephemeral-accounts.md`
- **Security Boundaries:** `/home/x-pact/.config/opencode/skills/magicblock/references/security.md`
- **Canonical State:** `/home/x-pact/PRIVATEPAY-X402-CANONICAL-STATE.md`

---

**Plan Version:** 1.0  
**Last Review:** 2026-11-17 (OpenCode Agent)  
**Approval Required Before Deploy:** YES
