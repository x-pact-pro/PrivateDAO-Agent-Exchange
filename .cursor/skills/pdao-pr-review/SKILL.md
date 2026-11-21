---
name: pdao-pr-review
description: "Execute CUR-GH-03: independently review a PrivateDAO patch and reconcile its GitHub check evidence."
---

Record the exact repository, PR if one exists, base SHA and head SHA.
Use native Git/GitHub reads to inspect the diff and checks for that revision.
Review source correctness, workflow triggers, artifacts, provider boundaries
and applicable release evidence. Reproduce a suspected defect when possible.

Each finding includes severity, file/line, failure conditions, impact and a
specific verification step. Send the report to ORCH and the repair owner.
Recheck fixes on the new revision. Do not self-certify a security audit.
Do not merge, dispatch production or post an external review/comment unless
the task explicitly includes that action.
