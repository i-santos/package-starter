# @i-santos/agent

Deterministic task lifecycle engine used by `@i-santos/ship`.

## API

- `TASK_STATES`
- `ALLOWED_TRANSITIONS`
- `isTaskState(value)`
- `canTransition(from, to)`
- `transitionTask(task, nextStatus, nowIso?)`
