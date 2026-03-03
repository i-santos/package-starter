---
"@i-santos/ship": patch
---

Improve firebase release verification with environment-aware healthchecks.

- add optional `firebase.healthcheckUrl` / `firebase.healthcheckUrls` support
- verify HTTP healthcheck (2xx) in firebase post-merge verification after deploy workflow success
- validate `firebase.healthcheckUrls` schema in `.ship.json` (absolute http(s) URLs)
- add tests and docs for healthcheck-aware firebase release validation
