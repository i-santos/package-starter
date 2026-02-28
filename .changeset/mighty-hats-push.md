---
"@i-santos/create-package-starter": minor
---

Add release auth strategy support for generated and managed release workflows via `--release-auth` (`pat`, `app`, `github-token`, `manual-trigger`) across create/init/setup-beta.

This allows teams to choose between PAT-based reliability, GitHub App tokens, built-in `GITHUB_TOKEN`, or explicit manual retrigger mode for release PR checks.
