---
"@i-santos/create-package-starter": patch
---

Update release workflow template to install latest npm before `npm ci` and clear `NODE_AUTH_TOKEN` in the Changesets step to avoid OIDC publish conflicts.
