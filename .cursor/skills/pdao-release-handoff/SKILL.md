---
name: pdao-release-handoff
description: Execute CUR-REL-01: prepare PrivateDAO build inputs and an evidence-based handoff for ORCH.
---

Support `REL-00` first: identify actual source-backed web origins,
extension IDs/callbacks and Android package/signing public identifiers.
Record unknowns and their owner; keep private signing material private.

For an assigned candidate, record source SHA, runtime/build versions,
artifact SHA-256, configuration references and the actual workflow run.
Keep immutable candidate inputs separate from test/review results.
After source/config/artifact changes, identify which evidence must be rerun.

Report `NOT_RUN`, failed checks and missing provider/device steps honestly.
Prepare release materials within the assignment. Public release/listing
remains subject to USER Mainnet acceptance, ORCH review, matching original
security-tool results and the original operation-specific authorization.
