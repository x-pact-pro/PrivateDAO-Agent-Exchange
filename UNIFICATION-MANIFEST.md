# PrivateDAO Agent Exchange Unified

This is the unified local Agent Exchange product. It remains a separate
deployable product from the PrivateDAO Core and PDAO Wallet.

## Components

- `exchange-runtime/`: Agent Exchange Lambda/API, catalog, PrivatePAY x402,
  tests, scripts, and public service logic.
- `agent-engine/`: Agent Engine source and configuration.
- `agent-plugin/`: MCP/agent plugin, skills, references, and product metadata.
- `mcp-registry/`: MCP registry metadata.

## Source boundary

- Runtime source was moved from `/home/x-pact/PrivateDAO-Agent-Exchange`.
- The last local Git checkout used for comparison is
  `/tmp/privatedao-agent-exchange-publish`.
- No credentials, wallet keys, or provider secrets are stored in this product
  directory.

## Verified locally

- `npm test`: 201 tests, 200 passed, 1 skipped, 0 failed.
- `npm run lint`: passed.
- `npm run verify:kernel-boundary`: passed.
- Security audit reports three low-severity transitive `elliptic` findings;
  no force upgrade was applied.
