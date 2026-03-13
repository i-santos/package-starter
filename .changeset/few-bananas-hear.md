---
"@i-santos/ship": patch
---

Improve `ship release` handling when a release PR is temporarily `BEHIND`. The command now keeps waiting when a recent code merge should still trigger the release workflow, including merges that happened just before the current run started, instead of aborting too early.
