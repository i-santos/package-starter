---
"@i-santos/ship": patch
---

Add firebase-focused setup profile for GitHub and improve firebase init defaults.

- add `setup-github --adapter firebase` with base/production branch support
- apply firebase GitHub branch rulesets for develop/production and set default branch to develop
- scaffold local deploy workflows (`deploy-staging.yml` and `deploy-production.yml`)
- add `init --adapter firebase` defaults to avoid npm/beta setup unless explicitly requested
- update docs and tests for firebase init/setup flows
