---
"@i-santos/create-package-starter": minor
---

Improve `setup-github` defaults to better support release automation.

- Configure GitHub Actions workflow permissions to `write` at repository level.
- Enable workflow ability to approve pull request reviews.
- Change default branch ruleset approval requirement from 1 reviewer to 0.
