---
'@i-santos/create-package-starter': patch
---

Fix `release-cycle` release PR selection to respect the active release track. Beta flows now wait/merge only `changeset-release/* -> release/beta`, while stable flows target `main`, preventing wrong-track merges and npm validation mismatches.
