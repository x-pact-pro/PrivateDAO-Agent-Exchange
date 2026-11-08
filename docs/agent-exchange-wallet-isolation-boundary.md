# Agent Exchange production and PDAO Wallet development boundary

Status: implementation boundary / non-destructive audit (2026-11-08)

## Ownership

- This repository owns the deployed Agent Exchange API, provider marketplace, PrivatePAY x402, customer/agent account sessions, evidence history, and delegated PrivatePAY Autopilot.
- The separately developed **PDAO Wallet** is not an Agent Exchange deployment target and must not be enabled, built, or deployed by this repository.
- Agent Exchange may accept the **public address** of an existing customer or agent wallet and prepare unsigned transactions. It never provisions a customer's wallet, receives a customer's private key, signs for an unapproved wallet, or enables the wallet's production broadcast gate.
- Wallet clients use the documented Agent Exchange HTTP/MCP API; no duplication of the PrivatePAY x402 payment protocol or settlement logic in the wallet.

## Data isolation: current versus target state

**Verified current state (Atlas EU_NORTH_1):**

- Production Agent Exchange DB: `privatedao_agent_exchange`. It contains service-specific collections and *some legacy wallet-prefixed collections*. Presence alone does not establish which service still consumes them.
- Separate development/test DB: `privatedao_wallet_e2e`.
- Both databases currently live on the same Atlas Free cluster, so separation at the database-name level is **not** an isolation of compute, storage, credentials, network policy, or blast radius.
- Agent Exchange's MongoDB provider covers account/session, evidence, and PrivatePAY Autopilot state; DynamoDB remains authoritative for payments and jobs.
- Production secrets live in AWS Secrets Manager, and must never be copied to local files, CI output, GitHub, or chat.

**Required before declaring wallet isolated:**

1. Audit the wallet-prefixed collections in the Agent Exchange database and all readers/writers; do not drop, rename, move, or alter these collections without a reviewed migration, backup, and validation.
2. Give Agent Exchange and Wallet distinct Atlas database users with minimal permissions scoped to their respective databases; rotate/change references only via a coordinated, reversible, verified cutover.
3. Keep wallet Secrets Manager references under `privatedao/wallet/*`; Agent Exchange references under `pdao/agent-exchange/*`. Never alias or copy application secrets across ownership without a documented reason and approval.
4. Before significantly increasing Lambda concurrency, verify Atlas connection limits, application pools, CPU, storage and operation latency; use measured gradual rollout and alarms.
5. A separate Atlas cluster/project for Wallet is required if strict fault isolation is desired. Do not move development data to paid shared production infrastructure by default.
6. The Wallet production sign/broadcast gates remain disabled until separately approved after independent cryptographic/PQC review.

## Runtime efficiency change in this PR

The Agent Exchange evidence, accounts, and PrivatePAY Autopilot modules share one cached MongoDB connection promise per MongoDB URI inside a warm Lambda environment. Each shared pool is bounded (`maxPoolSize=5`, `minPoolSize=0`, `maxIdleTimeMS=30000`). This reduces the number of distinct pools compared with the previous three independently initialized clients, **without changing any database names, data, connection strings, credentials, or wallet functionality**. The Autopilot index initialization promise is cached per URI/database in the warm environment.

## Release safety

- No live AWS Lambda, Atlas cluster tier, user, secret, wallet broadcast, or production payment changes are part of this PR.
- Validate with syntax, focused tests, full tests, and production-contract probes before promotion.
- Production deployment requires the repository's existing separate explicit approval workflow and rollback capture.
