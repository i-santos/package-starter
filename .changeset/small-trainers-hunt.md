---
'@i-santos/create-package-starter': patch
---

Fix `release-cycle` npm validation target resolution for monorepos/workspaces by deriving package names and versions from changed `package.json` files in the release PR. Also adds `--npm-package` override support for explicit package selection.
