---
'@i-santos/npmstack': major
---

Breaking change: release orchestration moved behind the `ship` namespace.

- removed direct `npmstack release-cycle ...`
- added `npmstack ship release-cycle ...`
- added `npmstack ship open-pr ...`

`npmstack` remains responsible for scaffolding/setup flows.
