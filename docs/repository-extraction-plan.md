# Agent Exchange Repository Extraction Plan

Status: proposal only. No production routing, storage, secret, or deployment change is authorized by this document.

## Decision

Agent Exchange should become a separate repository because it has an independent runtime, release cadence, public API, seller marketplace, and AWS Lambda deployment. The extraction must preserve the existing public service and its contracts.

This repository is initially a faithful source mirror of the former
`integrations/agent-exchange-lambda` boundary. It must not be a rewrite and
must not introduce a second payment or receipt implementation.

## Product Catalog Decision

The public Agent Exchange catalog has exactly 27 top-level entries:

- 26 independently discoverable PrivateDAO services. Each service keeps its
  own identifier, schema, access tier, execution boundary, receipt, and
  availability state.
- `privatepay.x402` as the 27th and final top-level entry. It is the
  PrivatePAY x402 Marketplace/container, not a duplicate 27th analysis
  service. Its marketplace metadata lists the 26 service identifiers and the
  paid services that may select PrivatePAY x402 settlement.

The container does not hide or merge the 26 services. A human customer or an
authorized external agent can discover a service directly, request its quote,
choose PrivatePAY x402 when that service is paid and the rail is available,
and receive the normal service receipt. Free services remain free and must not
be forced through a payment challenge. The wallet, Agent Exchange, and
PrivatePAY integrations must preserve this hierarchy.

## Must remain unchanged during extraction

- `https://agents.privatedao.org` and every existing public route.
- Agent Card, MCP, A2A, OpenAPI, marketplace, quote, job, payment, receipt, and seller routes.
- Existing Lambda function name, AWS region, runtime, alias/version behavior, and rollback package flow.
- DynamoDB table names and key shapes, MongoDB database/collection settings, and all existing records.
- Secret names and environment variable names, including `AGENT_EXCHANGE_*` and PrivatePAY secrets.
- x402 payment requirements, payment IDs, idempotency behavior, settlement states, and receipt structure.
- PrivateDAO Kernel, institutional identity/policy systems, six enterprise products, Solana networks, and PDAO Wallet account roadmap.

## Move to the new repository

- `src/` Agent Exchange handler, catalog, registry, seller onboarding, execution, receipts, settlement, revenue, and PrivatePAY adapter code.
- `test/`, `scripts/`, `assets/`, package metadata, lockfile, and Agent Exchange-specific documentation.
- Agent Exchange CI, verification, packaging, and deployment workflows after their repository variables and OIDC role are recreated.

## Keep as explicit integration contracts

The PrivateDAO repository may retain only typed/client-facing integration contracts and links:

- Agent discovery provider and catalog capability metadata.
- Public Agent Exchange base URL configuration.
- PrivatePAY checkout client contract and receipt consumer contract.
- PDAO Wallet authorization boundary for consuming services.

These consumers must call the public API. They must not copy Agent Exchange storage, seller logic, payment verification, or receipt generation.

## Migration gates

1. Create the destination repository privately and import the current directory history or an audited initial snapshot.
2. Reproduce CI with the same Node version, lockfile, tests, smoke checks, package checksum verification, and OIDC deployment gate.
3. Run contract tests against the current production URL and the destination candidate without changing production traffic.
4. Deploy the candidate to a separate Lambda/version or alias with isolated non-production resources. Never point it at production tables until read/write compatibility is verified.
5. Perform a read-only parity check for public routes, Agent Card, MCP, marketplace catalog, quote shape, and status-code semantics.
6. Perform a controlled canary using a separate hostname or API Gateway stage. Verify x402 quote, signed payment submission, settlement idempotency, service execution, receipt, seller revenue, and retry recovery.
7. Switch the existing production alias or routing target atomically, preserving the previous Lambda version for immediate rollback.
8. Monitor errors, latency, payment state transitions, receipts, and seller payouts before removing the old source copy.
9. Remove the old implementation only after an explicit review confirms the destination is the sole source of truth.

## Rollback rule

Rollback is a deployment/version switch, not a database restore. Do not rename, migrate, delete, or recreate production tables during the repository move. Any schema change requires a separate backward-compatible migration and review.

## Current evidence

- The current production deployment workflow already gates on same-SHA CI and Agent Exchange verification, captures the deployed Lambda package, validates its checksum, and publishes an immutable version.
- The standalone repository at `x-pact-pro/PrivateDAO-Agent-Exchange` is present locally and is the intended Agent Exchange source-of-truth boundary after parity and canary acceptance.
- The catalog contract is implemented locally as 26 independent services plus the `privatepay.x402` marketplace container; the deployed public surface is stale until a reviewed release is published.
- PrivatePAY Autopilot now requires exact service, CAIP-2 network, token mint, and payment-recipient allowlists, and binds those values into the signed operation challenge. The agent session private key remains external to PrivateDAO.
- The local read-only release evidence is currently `blocked`: the required `payment_ingress` account is not configured, while the public status endpoint reports `enabled`. This discrepancy must be resolved before treating the rail as Mainnet-ready.
- The release-evidence artifact is written to `output/privatepay/release-evidence.json`; collection performs no signing or broadcast.

## Active readiness blockers

- Configure and independently verify the required PrivatePAY payment ingress account and its delegation/funding state.
- Publish and verify the reviewed Agent Exchange release so the live surface matches the local 27-entry catalog and autopilot contract.
- Keep real trading and EVM transaction execution disabled until the production signer, policy checks, simulation, and recovery tests are independently accepted.
- Complete the wallet release build, Android/Firebase matrix, external security review, and final production-readiness gate under available disk capacity.

## Explicit non-goals

- No repository deletion or history rewrite.
- No production traffic switch.
- No secret copying into GitHub.
- No wallet signing, funded transaction, or settlement action.
- No modification to the Kernel or the six institutional products.
