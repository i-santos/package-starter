---
'@i-santos/create-package-starter': minor
---

Improve `release-cycle` with automatic resume and base-branch synchronization. Adds `--sync-base` (default `auto`) to rebase/merge feature branches when behind `release/beta`, and resume behavior (default on, disable with `--no-resume`) so reruns can continue release stages when code is already integrated.
