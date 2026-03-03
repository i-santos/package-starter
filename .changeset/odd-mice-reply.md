---
"@i-santos/ship": patch
---

Link `--task-id` into PR/release orchestration so task lifecycle state stays in sync.

- open-pr now writes `release.prNumber` when a task id is provided
- release now records merge commit (`release.mergeCommit`) after PR merges
- release now marks `release.published = true` after successful post-merge verification
- add regression tests for task linking in open-pr and release flows
