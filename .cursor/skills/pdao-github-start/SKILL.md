---
name: pdao-github-start
description: Start a PrivateDAO GitHub assignment with an actual source, authentication and workflow baseline.
---

Read the repository's agent instructions and `.cursor/rules/privatedao-execution.mdc`.
Record `CUR-GH-01`, the assigned repository, current branch, base SHA,
dirty state, actual selected model and original task reference.

Use native read operations:

```bash
git status --short
git rev-parse HEAD
gh api user --jq '{login: .login}'
gh repo view --json nameWithOwner,defaultBranchRef
gh run list --limit 10 --json databaseId,name,headSha,status,conclusion,event
```

Use the repository slug returned by `gh repo view`; do not print raw Git remote
configuration or credential-bearing URLs.
Inspect the actual `.github/workflows/` definitions and package scripts.
Report each run against its actual SHA; old successful runs are historical.
Map findings to `ENV-01`, `REL-00` or the assigned repair task.
This first operation collects evidence and proposes owned fixes. It does
not dispatch workflows, push commits, alter settings or deploy services.
