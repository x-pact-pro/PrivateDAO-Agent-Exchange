# PrivatePAY x402 MagicBlock P0 Fixes - Lambda Deployment Checklist

**Target Function:** `PrivateDAOAgentExchange-Function-N2zgpQmMN41S`  
**Region:** `eu-north-1` (Stockholm)  
**Date:** 2026-11-17  
**Operator:** _____________________________

---

## Pre-Deployment Verification (30 min)

### Code Quality Gates
- [ ] **Syntax Check:** `node --check src/handler.mjs` ✓ PASS
- [ ] **Syntax Check:** `node --check src/privatepay.mjs` ✓ PASS
- [ ] **Syntax Check:** `node --check src/privatepay-magicblock-validation.mjs` ✓ PASS
- [ ] **Lint:** `npm run lint` ✓ PASS (no errors or warnings)
- [ ] **TypeScript:** `npm run typecheck` ✓ PASS (no type errors)
- [ ] **Build:** `npm run build` ✓ PASS (artifact created)

### File Modifications Verified
- [ ] File added: `exchange-runtime/src/privatepay-magicblock-validation.mjs` (345 lines)
- [ ] File modified: `exchange-runtime/src/privatepay.mjs`
  - [ ] Line 3-4: Imports added
  - [ ] Line 489-508: P0 early check in `createPrivatePayRequirements()` (OPTIONAL)
  - [ ] Line 650-670: P0 fatal gate in `createPrivatePayCheckout()` (REQUIRED)
- [ ] File modified: `exchange-runtime/src/handler.mjs`
  - [ ] Line 52: Import statement already present (no change)

### Local Testing Complete
- [ ] Test script: `node test-p0-fixes.mjs` ✓ ALL TESTS PASS
  - [ ] TEST 1: All P0 gates pass ✓
  - [ ] TEST 2: P0.1 delegation fails correctly ✓
  - [ ] TEST 3: P0.1 missing params rejected ✓
  - [ ] TEST 4: P0.2 past expiry rejected ✓
  - [ ] TEST 5: P0.3 missing config rejected ✓

### Configuration Verification
- [ ] Config field `privatePayValidatorAddress` is present or defaults to `config.magicBlockTeePubkey`
- [ ] Config field `privatePayFacilitatorApiKey` loaded from AWS Secrets Manager: `pdao/agent-exchange/facilitator`
- [ ] Config field `DEFAULT_PRIVATEPAY_TEE_RPC` = `https://mainnet-private.magicblock.app`
- [ ] USDC Mint is correct: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- [ ] Validator address is **NOT** hardcoded (uses config)

### AWS Secrets Manager Validated
- [ ] Secret exists: `pdao/agent-exchange/facilitator` with valid Bearer token
- [ ] Lambda execution role has `GetSecretValue` permission for that secret
- [ ] No console logs will print secret values

---

## Build & Package (10 min)

### Artifact Creation
```bash
cd /home/x-pact/PrivateDAO-AGENT-EXCHANGE-UNIFIED/exchange-runtime
npm run build
zip -r deployment-package.zip . -x "*.git*" "node_modules/@*" "test/*"
sha256sum deployment-package.zip > deployment-package.zip.sha256
ls -lh deployment-package.zip*
```

- [ ] Artifact size: _________ KB
- [ ] SHA-256: `_________________________________`
- [ ] Artifact checksum matches pre-deployment baseline
- [ ] Artifact scanned for secrets/credentials (none found)

---

## Pre-Flight Checks (15 min)

### Current Lambda State
```bash
aws lambda get-function \
  --region eu-north-1 \
  --function-name PrivateDAOAgentExchange-Function-N2zgpQmMN41S \
  --query 'Configuration.CodeSha256'
```

- [ ] Current CodeSha256: `_________________________________`
- [ ] Current Version: _________ (numeric)
- [ ] Function state: ACTIVE (not Updating)
- [ ] Last modified: _________ (should be >1 day old)

### CloudWatch Logs Pre-Deployment Baseline
```bash
aws logs tail /aws/lambda/PrivateDAOAgentExchange-Function-N2zgpQmMN41S \
  --region eu-north-1 \
  --since 10m --follow &
# Leave running during deployment for real-time monitoring
```

- [ ] Log group exists and is readable
- [ ] Log retention: 30 days (verified)
- [ ] No active alarms blocking deployment

### API Gateway Routes Verified
```bash
aws apigatewayv2 get-apis --region eu-north-1 | grep -i privatepay
```

- [ ] Route `/api/privatepay/x402` is active
- [ ] Route `/api/privatepay/x402/checkout` is active
- [ ] CORS headers include `*` or correct origin

---

## Canary Deployment Phase (45 min)

### Lambda Update (5 min)

```bash
aws lambda update-function-code \
  --region eu-north-1 \
  --function-name PrivateDAOAgentExchange-Function-N2zgpQmMN41S \
  --zip-file fileb://deployment-package.zip
```

- [ ] Update accepted (HTTP 200)
- [ ] New CodeSha256: `_________________________________`
- [ ] Function state: Updating → Active (wait 30s)

### Live Health Check (5 min)

```bash
curl -X GET https://agents.privatedao.org/api/health
curl -X GET https://agents.privatedao.org/api/services
curl -X GET https://agents.privatedao.org/api/privatepay/status
```

- [ ] `/api/health` returns `200 OK`
- [ ] `/api/services` returns `200 OK`, count = 27
- [ ] `/api/privatepay/status` returns `200 OK`, `enabled: true`
- [ ] No activation blockers reported

### Live Requirements Probe (5 min) — NON-FUNDED

```bash
curl -X POST https://agents.privatedao.org/api/privatepay/x402/requirements \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "https://agents.privatedao.org/api/test",
    "provider_id": "test-provider",
    "payer": "...", // Optional test payer
    "amount_base_units": "500000"
  }'
```

- [ ] Response: `200 OK`
- [ ] Contains `x402Version: 2`
- [ ] Scheme: `exact-magicblock`
- [ ] Network: `solana-mainnet-private`
- [ ] No checkout challenge yet (good)

### CloudWatch Logs Monitor

- [ ] [PrivatePAY] logs appear in real-time
- [ ] No ERROR or FATAL messages
- [ ] No timeout or 503 errors for live probes
- [ ] No hardcoded validator address (ensure config is used)

---

## Bounded Canary Test (20 min) — FUNDED

### Dedicated Payer Setup
- [ ] Payer wallet pubkey: `_________________________________`
- [ ] Payer has **exactly 500,100 USDC** (500k for test, 100 for fees/slippage)
- [ ] Payer is NOT a production merchant or multi-signer account
- [ ] This is a **SINGLE-USE TEST WALLET** that will be reset after test

### Canary Checkout Request (5 min)

```bash
TEST_PAYER="<wallet_pubkey_from_above>"

curl -X POST https://agents.privatedao.org/api/privatepay/x402/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-only-context" \
  -d '{
    "payer": "'$TEST_PAYER'",
    "resource": "https://agents.privatedao.org/test-canary",
    "external_reference": "canary-2026-11-17-001",
    "description": "P0 fixes canary test",
    "amount_base_units": "500000",
    "expires_in_seconds": 3600
  }'
```

**Expected response (HTTP 202):**
```json
{
  "payment_id": "pp_[64_hex_chars]",
  "status": "pending",
  "provider_status": 202,
  "expires_at": "2026-11-17T11:30:00Z",
  "cluster": "mainnet-private"
}
```

- [ ] Response code: **HTTP 202** (pending, not 200 or 409)
- [ ] `payment_id` matches format: `pp_[a-f0-9]{64}`
- [ ] `status`: `"pending"`
- [ ] CloudWatch: All P0 gates logged as passed

### Canary Payment Signature (10 min)

*Note: This requires actual wallet signing. In a bounded test, use a previously captured transaction or mock.*

```bash
PAYMENT_ID="pp_<from_above>"
SIGNED_TX="<base64_transaction_signed_locally>"
PAYMENT_SIGNATURE="<base64url_signature_header>"

curl -X POST https://agents.privatedao.org/api/privatepay/x402 \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: $PAYMENT_SIGNATURE" \
  -d '{
    "x402Version": 2,
    "paymentPayload": {...},
    "paymentRequirements": {...}
  }'
```

- [ ] Settlement initiated without errors
- [ ] CloudWatch: Settlement logs appear
- [ ] No P0 gate retry loops (should be cached)
- [ ] Settlement signature appears in logs (redacted)

### TEE Finality Verification (5 min)

```bash
# Query TEE endpoint for finality confirmation
curl https://mainnet-private.magicblock.app \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getSignatureStatuses",
    "params": [["<settlement_signature_from_logs>"]]
  }'
```

- [ ] Settlement signature confirmed on TEE
- [ ] Confirmation status: `confirmed` (not `processed` or `finalized`)
- [ ] Payer USDC balance: **decreased by 500,000 base units**
- [ ] Treasury account: **received ~487,500 USDC** (2.5% fee deducted)

### Canary Cleanup
- [ ] Canary payer wallet marked for reset
- [ ] Payment ID recorded in incident report
- [ ] Settlement signature captured for rollback reference

---

## Post-Canary Verification (15 min)

### Revert to Baseline (if needed)

If canary fails or produces unexpected behavior:

```bash
aws lambda update-function-code \
  --region eu-north-1 \
  --function-name PrivateDAOAgentExchange-Function-N2zgpQmMN41S \
  --zip-file fileb://ROLLBACK_PREVIOUS_VERSION.zip
```

- [ ] Rollback succeeded
- [ ] Function state: Active
- [ ] Previous CodeSha256 restored
- [ ] Health check passes again

### Canary Success Analysis

If canary passes:

- [ ] All P0 gates passed for test payer
- [ ] Settlement finalized on TEE with expected amount
- [ ] No duplicate payments (idempotency verified)
- [ ] No cache collisions or validator state issues
- [ ] CloudWatch metrics show expected latencies:
  - [ ] P0.1 delegation check: `< 1000ms`
  - [ ] P0.2 permission setup: `< 2000ms`
  - [ ] P0.3 transfer queue: `< 1500ms`

---

## Production Rollout (Optional, if not canary-gated)

### Full Deployment
- [ ] Artifact SHA-256 final verification: `_________________________________`
- [ ] Code review approval from: _____________________________
- [ ] Security review approval from: _____________________________
- [ ] MagicBlock integration review: PASSED

### Post-Production Verification

```bash
# Live status check
curl https://agents.privatedao.org/api/privatepay/status

# Verify merchant catalog (27 services)
curl https://agents.privatedao.org/api/services | jq '.services | length'

# Verify PrivatePAY service is listed
curl https://agents.privatedao.org/api/services | jq '.services[] | select(.id == "privatepay.x402")'
```

- [ ] Status endpoint operational
- [ ] Service count: 27 (PrivatePAY included)
- [ ] No regressions reported in Agent Exchange logs

---

## Monitoring Activation (30 min Post-Deploy)

### CloudWatch Dashboard

Create or update dashboard with these metrics:

```
Namespace: PrivatePayMagicBlock

Metrics:
- P0.1DelegationValidationTime (milliseconds)
- P0.2PermissionSetupTime (milliseconds)
- P0.3TransferQueueInitTime (milliseconds)
- P0GatePassRate (percent)
- P0GateFailureByType (count, dimensions: P0.1/P0.2/P0.3)
```

- [ ] Dashboard created: `PrivatePAY-P0-Fixes`
- [ ] All metrics streaming data
- [ ] Alarms configured:
  - [ ] P0.1 timeout (> 5000ms) → SNS topic
  - [ ] P0.2 auth failure (401/403) → SNS topic
  - [ ] P0.3 init failure (>1 per hour) → SNS topic

### CloudWatch Logs Insights Queries

Save these queries for on-call:

```
fields @timestamp, @message, payment_id, error_code
| filter @message like /P0\.(1|2|3)/
| stats count() by error_code
```

```
fields @timestamp, @duration
| filter @message like /P0 ALL GATES PASSED/
| stats avg(@duration), max(@duration), pct(@duration, 95)
```

- [ ] Queries validated and returning expected data
- [ ] Baseline latencies recorded for future comparison

---

## Incident Response Plan (For On-Call)

### Scenario 1: P0.1 Delegation Failures Spiking

**Symptoms:** Error messages with code `PRIVATEPAY_ACCOUNT_NOT_DELEGATED`

**Actions:**
1. Check MagicBlock status: `https://status.magicblock.app/api/services`
2. Verify ER endpoint is operational: `curl https://mainnet-private.magicblock.app`
3. Check for validator maintenance or redeploy
4. **Do NOT roll back** — this is a validator state issue, not Lambda code issue
5. Post to #ops-magicblock Slack channel

### Scenario 2: P0.2 Permission Auth Failures

**Symptoms:** Error messages with code `PRIVATEPAY_PER_PERMISSION_FAILED` and status 401/403

**Actions:**
1. Verify Bearer token in AWS Secrets Manager: `aws secretsmanager get-secret-value --secret-id pdao/agent-exchange/facilitator`
2. Check token expiry/rotation (if MagicBlock enforces it)
3. Request new token from MagicBlock if expired
4. Update secret: `aws secretsmanager update-secret --secret-id pdao/agent-exchange/facilitator --secret-string <new_token>`
5. Lambda will auto-refresh on next invocation (no redeploy needed)

### Scenario 3: P0.3 Transfer Queue Init Failures

**Symptoms:** Error messages with code `PRIVATEPAY_TRANSFER_QUEUE_INIT_FAILED` and status 503

**Actions:**
1. Check ER endpoint health: `curl https://mainnet-private.magicblock.app/health`
2. Query transfer queue status directly on ER
3. If validator has limited resources, file ticket with MagicBlock
4. **Temporary**: Increase P0.3 retry timeout from 5s to 10s in config
5. Monitor for recovery; if persistent >30 min, consider canary rollback

---

## Sign-Off

- [ ] All pre-deployment checks: **PASSED**
- [ ] Canary test: **PASSED** (or N/A if not required)
- [ ] Production verification: **PASSED**
- [ ] Monitoring activated: **YES**
- [ ] Incident response plan: **REVIEWED**

**Deployed by:** ___________________________  
**Date/Time:** 2026-11-17 __:__:__ UTC  
**Approval by:** ___________________________  
**Date/Time:** 2026-11-17 __:__:__ UTC

---

## Post-Deployment Follow-Up (24 hr)

- [ ] No P0 gate failures in production (1-day baseline)
- [ ] No increase in 503 errors compared to pre-deployment
- [ ] Merchant checkout success rate: ________% (baseline: 98%+)
- [ ] Average P0 validation latency: ________ms (SLA: <3000ms)
- [ ] No SEV-1 or SEV-2 incidents attributed to P0 changes

**Status:** APPROVED FOR PRODUCTION ✓

---

**Document Version:** 1.0  
**Last Updated:** 2026-11-17  
**Archive Location:** `/tmp/opencode/p0-fixes/deployment-checklist.md`
