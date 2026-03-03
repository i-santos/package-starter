---
"@i-santos/ship": minor
---

Expand `ship task` lifecycle support with deterministic plan and verify actions.

- add `ship task plan --id <taskId>` transitioning tasks to `planned`
- add `ship task verify --id <taskId>` transitioning tasks to `verified`
- generate canonical artifacts for plan (`.agents/plans/*.plan.md`) and verification (`docs/tests/*.local.md`)
- persist operation records into `.agents/state/ops.log`
- keep `--json` and `--dry-run` behavior for automation-friendly execution
