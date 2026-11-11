# PrivatePAY x402 — Dedicated MCP and Wallet Authentication

## Remote MCP endpoint

`https://agents.privatedao.org/mcp/privatepay`

Transport: Streamable HTTP (JSON-RPC 2.0 POST). This endpoint lists only the `privatepay_*` tools, separate from the full Agent Exchange catalog at `https://agents.privatedao.org/mcp`.

Configure a remote MCP client with:

```json
{
  "mcpServers": {
    "privatepay-x402": {
      "url": "https://agents.privatedao.org/mcp/privatepay"
    }
  }
}
```

The dedicated endpoint supports `initialize`, `ping`, `tools/list`, and `tools/call`. Public status is available without wallet authentication. Private balances always require a live, wallet-signed MagicBlock challenge; providing only a public address never grants access.

## Exact wallet authorization (Solana Mainnet)

1. `privatepay_wallet_challenge({wallet})`: fetch a fresh provider challenge bound to the public wallet. Do not ask for a private key or seed phrase.
2. Display the returned `message` verbatim. Ask the user to sign it with their own Solana wallet's `signMessage` method. This is NOT a transaction signature.
3. `privatepay_private_balance({wallet,challenge,signature})`: submit the original challenge and the wallet's Base64 Ed25519 signature. PrivateDAO calls MagicBlock `POST /v1/spl/login` and then `GET /v1/spl/private-balance` with the short-lived bearer token, on the backend only.
4. Confirm `authenticated: true`, `location: "ephemeral"`, the exact public wallet, mint and Mainnet cluster. The token must never be returned to the client, persisted in MongoDB, logged, or included in a receipt.
5. A successful read enables the user interface to proceed to a quote-first checkout. Every money-moving payment still requires a **separate** signed transaction and the server-side x402 verification/settlement checks.

Existing shielded funds must be reconciled before any new deposit. In particular, a delegated account or an upstream HTTP 400 is **not** an instruction to shield again. A provider rejection is surfaced as `PRIVATEPAY_PRIVATE_BALANCE_REJECTED` with only the sanitized `provider_status` and machine-readable `provider_error_code` when available. The raw upstream response and private session credentials are never disclosed.

## Payment tools

`privatepay_status`: free readiness and privacy boundaries

`privatepay_wallet_challenge`: request wallet ownership challenge (no payment)

`privatepay_private_balance`: authenticated shielded USDC read (no payment)

`privatepay_challenge`: create exact x402 v2 payment requirements

`privatepay_checkout`: create payment checkout and obtain its challenge

`privatepay_prepare`: build unsigned deposit/transfer/withdrawal for user review (never broadcast)

`privatepay_verify`: verify the exact user-authorized payload

`privatepay_settle`: **payment-moving** settlement — require explicit user approval and independent proof

`privatepay_job_payment`: apply a finalized PrivatePAY payment proof to a job — financial side effect, require explicit approval

Never substitute a guessed merchant, payer, amount, token mint, or `payTo`. Do not bypass a checkout binding mismatch. Never auto-retry an ambiguous settlement or assume a deposit has succeeded without on-chain finality and provider reconciliation.

## Release gate

Local tests and the GitHub workflow prove only code/fixture behavior. Production completion requires an approved deployment, live Mainnet wallet challenge/signature/login/private-balance, a wallet-approved quote-specific x402 payment, and verified final settlement/receipt. Neither `enabled: true` nor HTTP 200 from `/api/health` alone establishes a successful Mainnet E2E payment.
