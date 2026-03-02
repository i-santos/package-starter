---
'@i-santos/create-package-starter': patch
---

Fix `release-cycle` to handle successful direct publish runs (without opening a release PR) and avoid timeout waiting for a PR that will never be created. Also improves npm validation target resolution for this path by deriving package metadata from repository manifests/workspaces with optional `--npm-package` override.
