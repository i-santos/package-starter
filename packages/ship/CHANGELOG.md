# @i-santos/ship

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
