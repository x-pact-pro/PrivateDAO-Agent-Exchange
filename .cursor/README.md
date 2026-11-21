# PrivateDAO Agent Exchange Cursor environment

This repository keeps its native Cursor configuration separate from the
wallet application. `.cursor/rules`, `.cursor/agents`, `.cursor/skills` and
`environment.json` are setup files, not evidence of cloud activation or release.

Use `/pdao-github-start`, then the assigned `/pdao-ci-repair`,
`/pdao-pr-review` or `/pdao-release-handoff`.
The three specialist agents use `composer-2.5`; confirm account availability
with `cursor-agent models` and record the actual model selected at runtime.
Codex ORCH retains overall task ownership and shared-file reservations.

```bash
cursor-agent login
cursor-agent models
cursor-agent --model composer-2.5 --workspace /home/x-pact/PrivateDAO-Agent-Exchange
```

These commands do not set terminal permissions, sandbox mode, forced
approvals or an AWS provider override. GitHub CLI uses its existing
authentication. MCP authentication remains client-specific.

Cloud Agents can use the existing connected repository and a revision that
contains `.cursor/`. The recipe uses Node 26, GitHub's original CLI package
source and the committed npm lockfile. Verify the actual Build result;
saved personal/team environments can override repository configuration.
Select the model through the agent UI, not through `environment.json`.
Cloud machines do not inherit workstation paths, credentials or OAuth.
Never place production credentials or `.env` files in the image.

Use this repository's `npm run lint`, `npm test`, `npm run smoke` and
assigned verification scripts. Fixture-based test success is not funded
production E2E. Deployment remains a separate explicitly authorized operation.

The workstation task contract is
`/home/x-pact/Desktop/PDAO-EXECUTION-TEAM-2026-11-21/CURSOR-OPERATIONS.md`.
