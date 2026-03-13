# @i-santos/ship

## 1.0.0-beta.15

### Patch Changes

- 89fbcc0: Improve `ship release` handling when a release PR is temporarily `BEHIND`. The command now keeps waiting when a recent code merge should still trigger the release workflow, including merges that happened just before the current run started, instead of aborting too early.
- 619ccac: Remove the standalone `ship open-pr` command and consolidate code PR orchestration under `ship release --phase code`. Default auto-merge now uses regular merge commits, and GitHub setup enables squash, merge, and rebase methods so release flows can select the configured merge strategy.
- aff3b4f: Add layered ship configuration (`global`, repository, and repository-local overrides), introduce `ship config defaults` for managing release behavior preferences, and make release cleanup configurable across both `code` and `full` phases.
- 9d31a80: Clarify `ship release` messaging when no release PR is created by distinguishing direct package publishes from no-op release workflows that did not publish new versions.
- 3c7acb2: Fix beta release npm validation so no-op publishes do not wait for npm propagation when the expected stable version is already present without a `beta` dist-tag.

## 1.0.0-beta.14

### Patch Changes

- 3e8047c: Improve firebase release verification with environment-aware healthchecks.

  - add optional `firebase.healthcheckUrl` / `firebase.healthcheckUrls` support
  - verify HTTP healthcheck (2xx) in firebase post-merge verification after deploy workflow success
  - validate `firebase.healthcheckUrls` schema in `.ship.json` (absolute http(s) URLs)
  - add tests and docs for healthcheck-aware firebase release validation

## 1.0.0-beta.13

### Patch Changes

- 34ff954: Add firebase-focused setup profile for GitHub and improve firebase init defaults.

  - add `setup-github --adapter firebase` with base/production branch support
  - apply firebase GitHub branch rulesets for develop/production and set default branch to develop
  - scaffold local deploy workflows (`deploy-staging.yml` and `deploy-production.yml`)
  - add `init --adapter firebase` defaults to avoid npm/beta setup unless explicitly requested
  - update docs and tests for firebase init/setup flows

## 1.0.0-beta.12

### Patch Changes

- c485055: Add multi-target release execution for hybrid repositories.

  - add `ship release --targets <single|auto>` (`single` default)
  - execute all configured `releaseTargets` in order when `--targets auto`
  - apply `releasePolicy.stopOnError` (`true` stops early, `false` continues and fails at the end if needed)
  - keep `--target` for explicit single-target execution
  - add tests and docs for target plan resolution and stopOnError behavior

## 1.0.0-beta.11

### Patch Changes

- 74e6c53: Add release target selection support and hybrid release config schema groundwork.

  - add `ship release --target <adapter>` for explicit adapter selection
  - add `.ship.json` support for `releaseTargets` and `releasePolicy.stopOnError`
  - resolve release adapter by priority: `--target` > first `releaseTargets` entry > `adapter`
  - emit warning when multiple `releaseTargets` are configured without `--target`
  - validate release target/policy config shape and update docs for hybrid repositories

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
