---
"@i-santos/ship": patch
---

Improve firebase adapter release behavior and configuration safety.

- validate required firebase config fields in `.ship.json` (`firebase.projectId`, `firebase.environments`, and `deploy.workflow`)
- support `direct_publish` release candidates from successful deploy workflow runs
- make firebase post-merge verification check configured deploy workflow status
- add tests and docs for firebase config contract and workflow-driven release detection
