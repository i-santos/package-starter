---
"@i-santos/ship": major
---

Refactor ship release/open-pr orchestration to be truly adapter-driven and add shell completion support.

- decouple `open-pr` and `release` core from npm-specific checks
- implement full npm adapter hooks for mode detection, release candidates, and post-merge verification
- support external adapters via `.ship.json` `adapterModule` with capability validation
- avoid duplicate code PR auto-merge enable attempts in release flow (idempotent behavior)
- add `ship completion <bash|zsh|fish>` for command/flag autocomplete generation
- update docs and tests for adapter contract and completion behavior
