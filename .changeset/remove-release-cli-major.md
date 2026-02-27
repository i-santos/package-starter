---
"@i-santos/create-package-starter": major
---

Remove `release-cli` integration and generate packages with a Changesets-only release workflow.

Breaking changes:

- Removed CLI options `--release-cli-pkg` and `--release-cli-version`.
- Generated package scripts now include only `check`, `changeset`, `version-packages`, and `release`.
- Removed legacy `release:beta`, `release:stable`, `release:publish`, and `registry:start` scripts from generated output.
