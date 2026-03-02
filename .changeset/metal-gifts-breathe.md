---
"@i-santos/ship": major
---
Complete migration to `ship` as the only CLI/package in the workspace.

- remove legacy `npmstack` package from monorepo
- migrate docs, workflows, scripts, examples, and templates to `ship`
- update tests and internal references to use `packages/ship`
