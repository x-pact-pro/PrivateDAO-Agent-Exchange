# PrivateDAO Cursor environment

These are native Cursor rules, skills and Cloud environment files for the
existing repository. The owner's Cursor workspace launches native OpenCode
workers with a distinct explicit Bedrock model for each role. Native worker
configuration is held once in the local PrivateDAO-TOOLS repository. It is
not a custom MCP server, proxy, SDK patch or shared Auto subagent setup.

Local task entrypoint:
`/home/x-pact/Desktop/PDAO-EXECUTION-TEAM-2026-11-21/PrivateDAO.code-workspace`.
Use Terminal → Run Task → PrivateDAO and supply the assigned task, source SHA
and owned paths. Local model assignments and actual validation are recorded in
`MULTIMODEL-OPERATIONS.md` and `TEAM.json` next to the workspace. The environment
starts a fresh interactive native process for each assignment; it does not
alter terminal permissions or the existing AWS/OpenAI provider configuration.

The four native skill contracts remain available as `/pdao-github-start`,
`/pdao-ci-repair`, `/pdao-pr-review` and `/pdao-release-handoff`. Cursor's own
CLI was separately authenticated and passed an interactive Auto read of
GitHub repository metadata and AWS Knowledge regions. Auto's hidden model is
not used as proof of independent worker models. GitHub MCP requires its own
native OAuth; working gh authentication is not proof of MCP authentication.

Cloud Agents can use the existing connected repository. Builds read the
environment's default-branch configuration; a feature-branch checkout runs
on top of the active Build and does not prove a changed Dockerfile was used.
The recipe uses Node 26, GitHub's original CLI package
source and the committed npm lockfile. Verify the actual Build result;
saved personal/team environments can override repository configuration.
Select an entitled model through the agent UI, not through `environment.json`.
Local CLI entitlement does not establish Cloud Agent access.
Cloud machines do not inherit workstation paths, credentials or OAuth.
Never place production credentials or `.env` files in the image.

Use this repository's `npm run lint`, `npm test`, `npm run smoke` and
assigned verification scripts. Fixture-based test success is not funded
production E2E. Deployment remains a separate explicitly authorized operation.

The workstation task contract is
`/home/x-pact/Desktop/PDAO-EXECUTION-TEAM-2026-11-21/CURSOR-OPERATIONS.md`.
