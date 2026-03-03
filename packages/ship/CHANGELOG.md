# @i-santos/ship

## 1.0.0-beta.10

### Patch Changes

- 06cea1c: Improve firebase adapter release behavior and configuration safety.

  - validate required firebase config fields in `.ship.json` (`firebase.projectId`, `firebase.environments`, and `deploy.workflow`)
  - support `direct_publish` release candidates from successful deploy workflow runs
  - make firebase post-merge verification check configured deploy workflow status
  - add tests and docs for firebase config contract and workflow-driven release detection

## 1.0.0-beta.9

### Minor Changes

- 05ff955: Expand `ship task` lifecycle support with deterministic plan and verify actions.

  - add `ship task plan --id <taskId>` transitioning tasks to `planned`
  - add `ship task verify --id <taskId>` transitioning tasks to `verified`
  - generate canonical artifacts for plan (`.agents/plans/*.plan.md`) and verification (`docs/tests/*.local.md`)
  - persist operation records into `.agents/state/ops.log`
  - keep `--json` and `--dry-run` behavior for automation-friendly execution

- 05ff955: Expand `ship task` lifecycle support with implement and publish-ready actions.

  - add `ship task implement --id <taskId>` transitioning tasks to `implemented`
  - add `ship task publish-ready --id <taskId>` transitioning tasks to `publish_ready`
  - enforce publish-ready precondition checks (`unit=pass` and `integration=pass`)
  - persist operation records for new task actions in `.agents/state/ops.log`

### Patch Changes

- 05ff955: Link `--task-id` into PR/release orchestration so task lifecycle state stays in sync.

  - open-pr now writes `release.prNumber` when a task id is provided
  - release now records merge commit (`release.mergeCommit`) after PR merges
  - release now marks `release.published = true` after successful post-merge verification
  - add regression tests for task linking in open-pr and release flows

## 1.0.0-beta.8

### Major Changes

- 69d4bc2: Restructure repository into a multi-package workspace and bootstrap agent/runtime foundations.

  - move `@i-santos/ship` implementation from repository root to `packages/ship`
  - convert repository root into private npm workspace orchestrator
  - add publishable `@i-santos/agent` package with deterministic task FSM core
  - add builtin `firebase` adapter in ship runtime (alongside builtin npm adapter)
  - keep release/test flows running from root workspace scripts

## 1.0.0-beta.7

### Major Changes

- 9564086: Refactor ship release/open-pr orchestration to be truly adapter-driven and add shell completion support.

  - decouple `open-pr` and `release` core from npm-specific checks
  - implement full npm adapter hooks for mode detection, release candidates, and post-merge verification
  - support external adapters via `.ship.json` `adapterModule` with capability validation
  - avoid duplicate code PR auto-merge enable attempts in release flow (idempotent behavior)
  - add `ship completion <bash|zsh|fish>` for command/flag autocomplete generation
  - update docs and tests for adapter contract and completion behavior

## 1.0.0-beta.6

### Patch Changes

- 3949a18: Flatten repository layout by moving `ship` package files from `packages/ship` to the repository root (`bin`, `lib`, `template`, and package metadata).

  No CLI command changes; this is an internal packaging/layout migration.
