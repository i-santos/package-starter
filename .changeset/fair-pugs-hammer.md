---
"@i-santos/create-package-starter": patch
---

Update release workflow template to use `CHANGESETS_GH_TOKEN` (fallback `GITHUB_TOKEN`) in `actions/checkout`, so release PR branch updates are performed with a token that correctly triggers downstream PR checks.
