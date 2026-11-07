# MagicBlock Questline integration

Quest 94 is exposed through the Agent Exchange Lambda at:

- `GET /api/questline/94/status?user={SOLANA_PUBKEY}`
- `POST /api/questline/94/participation/challenge`
- `POST /api/questline/94/participation`
- `POST /api/questline/94/complete`

MagicBlock Questline should use the read-only Pull endpoint above. It returns a
JSON boolean: `true` only after the server has stored a validated or completed
Questline record for the participating wallet, otherwise `false`. It does not
accept credentials, expose job identifiers, or perform writes. The endpoint is
safe to poll and is the preferred integration over server-side Push.

The route is stable for future quests: add their numeric IDs to the deployment
configuration variable `MAGICBLOCK_QUESTLINE_QUEST_IDS`, for example `94,95,96`.
The same route shape then applies to each quest:
`/api/questline/{questId}/status?user={SOLANA_PUBKEY}`.

The Push Bearer credential shown in the MagicBlock console is not needed by
Pull. Treat any credential visible in a screenshot or chat as compromised and
rotate it in the provider and Secrets Manager before using Push again.

The participation endpoint requires a wallet signature over the server-issued challenge. Completion is accepted only when the server finds:

1. A signed participation record for the wallet.
2. A completed zero-price first-party Agent Exchange job with a verified receipt.
3. A completed PrivatePAY job with a settled payment record whose payer matches the wallet.
4. An optional verified PDAO eligibility record, when supplied.

The completion key is deterministic and persisted in `QuestlineCompletions`. A conditional write prevents concurrent duplicate Push requests. Logs contain a wallet fingerprint rather than the wallet address or bearer token.

## Runtime configuration

The deployment environment must provide the variable names already present in the local `Quest.env` file:

- `MAGICBLOCK_QUESTLINE_SECRET_ID` (recommended; Secrets Manager JSON key
  `MAGICBLOCK_QUESTLINE_API_KEY` or `QUESTLINE_API_KEY`)
- `MAGICBLOCK_QUESTLINE_API_KEY` (legacy fallback; do not use in production)
- `MAGICBLOCK_QUESTLINE_REQUIRE_SECRET_MANAGER` (set to `true` in production;
  refuses the legacy fallback when no Secrets Manager reference is present)
- `MAGICBLOCK_QUESTLINE_BASE_URL`
- `MAGICBLOCK_QUESTLINE_QUEST_ID`

Optional deployment controls:

- `MAGICBLOCK_QUESTLINE_PUSH_PATH` (defaults to `/api/validators/run`)
- `MAGICBLOCK_QUESTLINE_PUSH_ENABLED` (defaults to `false`)
- `AGENT_EXCHANGE_QUESTLINE_COMPLETIONS_TABLE`

`MAGICBLOCK_QUESTLINE_PUSH_ENABLED` must remain false until the server-side Bearer Push contract and its request schema are confirmed by MagicBlock. The public Questline web client currently exposes `POST /api/validators/run` for a logged-in wallet session; that browser/session flow is not treated as proof of the server-side Bearer API contract.

Tests use mock HTTP responses and never send a real quest completion or payment.
