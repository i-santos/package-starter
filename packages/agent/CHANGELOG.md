# @i-santos/agent

## 0.1.0-beta.1

### Minor Changes

- 69d4bc2: Restructure repository into a multi-package workspace and bootstrap agent/runtime foundations.

  - move `@i-santos/ship` implementation from repository root to `packages/ship`
  - convert repository root into private npm workspace orchestrator
  - add publishable `@i-santos/agent` package with deterministic task FSM core
  - add builtin `firebase` adapter in ship runtime (alongside builtin npm adapter)
  - keep release/test flows running from root workspace scripts
