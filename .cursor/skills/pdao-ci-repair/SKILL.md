---
name: pdao-ci-repair
description: Execute CUR-GH-02 for an assigned PrivateDAO CI failure with reproduction, repair and independent review.
---

Read repository instructions and obtain the assigned check/run, SHA, owned
paths and task authorization. Use a dedicated branch/worktree for parallel
work and respect ORCH's reservation of CI, package and lock files.

1. Read the relevant native GitHub Actions log without exposing secrets.
2. Reproduce the failure using the committed lockfile and required runtime.
3. Fix the underlying defect; keep meaningful checks and original deployment gates.
4. Run the affected verification and applicable build.
5. Give the diff and real results to `pdao-pr-verifier`.
6. Repair findings and repeat the affected checks.

Wallet verification starts with `npm run typecheck`, `npm test` and
`npm run lint`; relevant builds are `npm run build`, `npm run build:chrome`
and Android's documented recipe. Agent Exchange uses its own package
scripts and repository instructions; fixture-based tests remain labeled.

Return commands, exit codes, before/after evidence, head SHA and remaining
external requirements. Native GitHub publishing actions use the original
task authorization; creating this skill grants no additional authorization.
