# @i-santos/ship

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
