---
"@i-santos/create-package-starter": minor
---

Add `setup-npm` command to bootstrap npm first-publish readiness.

- Validate npm CLI availability and authentication.
- Check whether package exists on npm.
- Support optional first publish execution with `--publish-first`.
- Support `--dry-run` to preview first publish without mutating.
- Print Trusted Publisher manual next steps after setup.
