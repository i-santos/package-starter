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
