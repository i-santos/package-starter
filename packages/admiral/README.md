# admiral

`admiral` is a local-first CLI for orchestrating multiple coding agents inside any Git repository.

It creates an isolated runtime in the target project, models work as a JSON task graph, and runs agents in parallel using `git worktree`.

## Current scope

The current implementation covers the practical core of phases 1 and 2:

- `admiral init`
- `admiral run`
- `admiral status`
- `admiral task create`
- `admiral task list`
- `admiral task status`
- `admiral task plan`
- `admiral task tdd`
- `admiral task implement`
- `admiral task verify`
- `admiral task publish-ready`
- `admiral task retry`
- `admiral task unblock`
- `admiral task done`
- `admiral merge`
- `admiral cleanup`

It also includes:

- local runtime folders under `.admiral/`, `kanban/`, `runtime/`, `events/`, and `workspaces/`
- task dependency handling through `kanban/graph.json`
- scheduler-based claiming and execution
- isolated workspaces through `git worktree`
- sparse checkout by task scope
- heartbeat, retry, and recovery handling

Inside the `navy` monorepo, `admiral` is the canonical owner of task orchestration and runtime state.

## Product Role

Inside `navy`, `admiral` is the system of record for:

- task creation
- workflow lifecycle progression
- task graph dependencies
- scheduler ownership and agent execution
- shared task metadata consumed later by `ship`

## Installation

```bash
npm install -g @i-santos/admiral
```

## Usage

Initialize `admiral` inside a Git repository:

```bash
admiral init
```

Create tasks:

```bash
admiral task create backend-auth --scope backend
admiral task create frontend-login --scope frontend --depends-on backend-auth
```

Advance workflow lifecycle:

```bash
admiral task plan backend-auth
admiral task tdd backend-auth
admiral task implement backend-auth
admiral task verify backend-auth
admiral task publish-ready backend-auth
```

Run the scheduler once:

```bash
admiral run --once
```

Check status:

```bash
admiral status
admiral task status backend-auth
```

Resolve operational states:

```bash
admiral task unblock backend-auth
admiral task done backend-auth
```

Delivery and release still happen through `ship`, using the same task identifier:

```bash
ship open-pr --task-id backend-auth --yes
ship release --task-id backend-auth --yes
```

## Configuration

`admiral init` creates `.admiral/config.json` with defaults such as:

- `max_agents`
- `scheduler_interval_ms`
- `heartbeat_timeout_ms`
- `max_retries_per_task`
- `default_branch`
- `agent_command`
- `scopes`

The runner is provider-agnostic. `admiral` executes the configured `agent_command` inside the task workspace and exposes task metadata through environment variables like:

- `ADMIRAL_TASK_ID`
- `ADMIRAL_TASK_TITLE`
- `ADMIRAL_TASK_SCOPE`
- `ADMIRAL_TASK_BRANCH`
- `ADMIRAL_TASK_WORKSPACE`
- `ADMIRAL_EXECUTION_ID`
- `ADMIRAL_EXECUTION_FILE`
- `ADMIRAL_RESULT_FILE`
- `ADMIRAL_LOG_FILE`

Before running the agent command, `admiral` now materializes an execution contract:

- workspace contract file: `.admiral/task-execution.json`
- workspace result file: `.admiral/task-result.json`
- runtime execution record: `runtime/executions/<task-id>.json`

This contract gives the agent a stable interface for reading task context and writing structured execution results.

It also materializes shared context files under `.admiral/context/`:

- `project.json`: global project context for all executions
- `tasks/<task-id>.json`: current task context, workflow state, and latest execution summary
- `handoffs/<task-id>.json`: rolling handoff history between executions/agents

`task-result.json` is now treated as a structured contract. Supported fields include:

- `status`: `succeeded` | `failed` | `blocked`
- `summary`
- `changed_files`
- `blockers`
- `next_actions`
- `tests_run`
- `artifacts`
- `handoff`
- `next_task_status`: `review` | `blocked` | `done`

## Development

Run tests:

```bash
npm test
```

Check the package contents before publishing:

```bash
npm run pack:check
```

## Publishing status

The package is functionally ready to pack. Before publishing to npm, make sure the repository metadata in `package.json` points to the final hosted Git URL.
