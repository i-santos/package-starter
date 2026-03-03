---
"@i-santos/ship": minor
---

Expand `ship task` lifecycle support with implement and publish-ready actions.

- add `ship task implement --id <taskId>` transitioning tasks to `implemented`
- add `ship task publish-ready --id <taskId>` transitioning tasks to `publish_ready`
- enforce publish-ready precondition checks (`unit=pass` and `integration=pass`)
- persist operation records for new task actions in `.agents/state/ops.log`
