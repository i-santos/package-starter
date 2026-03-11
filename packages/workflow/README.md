# @i-santos/workflow

Deterministic task lifecycle engine shared by `@i-santos/ship` and `@i-santos/admiral`.

## API

- `TASK_STATES`
- `ALLOWED_TRANSITIONS`
- `isTaskState(value)`
- `canTransition(from, to)`
- `transitionTask(task, nextStatus, nowIso?)`
- `createTaskRecord(input, nowIso?)`
- `readTaskRecord(value)`
- `attachTaskRecord(container, record)`
