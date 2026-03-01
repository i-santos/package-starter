---
'@i-santos/create-package-starter': patch
---

Improve `release-cycle` observability with periodic progress logs: while waiting for release PR creation it now reports release workflow status on `release/beta`, and while waiting npm propagation it reports observed `npm view version` and expected dist-tag values every 30 seconds.
