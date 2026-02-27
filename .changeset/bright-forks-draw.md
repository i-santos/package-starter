---
"@i-santos/create-package-starter": minor
---

Expand package-starter to be the single source of truth for npm package DX.

- Extend `create` and `init` to manage standardized release/CI/docs repository baselines.
- Add `setup-github` command to apply repository defaults and branch ruleset via `gh`.
- Add deterministic command summaries and broader test coverage for create/init/setup-github/template snapshots.
- Update docs with migration guidance and npm Trusted Publishing flow.
