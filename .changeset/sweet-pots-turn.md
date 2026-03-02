---
'@i-santos/ship': minor
---

Expand the built-in npm adapter in `ship` to support full package workflows (`create`, `init`, `setup-github`, `setup-beta`, `setup-npm`, `promote-stable`) and make init autonomous by default for GitHub + npm setup (including first publish when package is missing).

Also adds third-party adapter loading hooks via `.ship.json` (`adapterModule`) and runtime resolver injection.
