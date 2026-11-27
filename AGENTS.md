# Agent Exchange working instructions

`PROVIDER_CONFORMANCE_GATE: critical`

- This repository is the standalone PDAO Wallet Agent Exchange and PrivatePAY
  x402 service. Do not copy it into the Wallet repository.
- Use Node.js 24.10.0 for local verification, packaging and CI. AWS Lambda uses
  the managed `nodejs24.x` runtime; AWS controls its patch/minor runtime version
  and automatic security updates.
- For provider-dependent architecture, repair, integration and UX, the
  publisher-operated official MCP is the governing contract.
- MCP supplies contract discovery and verification. Deploy with the
  publisher's documented deployment workflow; MCP is not a substitute
  deployment mechanism.
- If the official MCP does not cover an operation, record the exact gap and
  use the publisher's official documentation. Do not invent provider behavior.
- Implement the provider's mandatory requirements exactly. Do not add stricter
  application blocks or reinterpret supported provider responses as failures.
- PrivatePAY and PDAO Wallet provide the customer-facing x402 product and API.
  x402 is the protocol layer; MagicBlock is the private SPL settlement provider
  used by the `exact-magicblock` scheme. Do not market x402 as a MagicBlock
  product or attribute the PrivatePAY x402 interface to the settlement vendor.
- Treat the pinned `magicblock-labs/ephemeral-spl-token` commit in
  `provider-conformance.json` as the source contract for SPL Private Payments.
  Reference its Pinocchio/native program; do not copy or fork that provider
  program into this Node.js service.
- Keep Anchor 1.0.2 and Anchor 0.32.1 as separate workspace profiles. Never
  combine their CLI, Rust crates or TypeScript clients inside one build.
- Keep credentials out of source, logs and reports. Use the configured AWS
  GitHub OIDC deployment role and repository variables.
- Never sign or broadcast a buyer payment from this service.
