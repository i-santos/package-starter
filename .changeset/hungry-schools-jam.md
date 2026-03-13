---
"@i-santos/ship": patch
---

Remove the standalone `ship open-pr` command and consolidate code PR orchestration under `ship release --phase code`. Default auto-merge now uses regular merge commits, and GitHub setup enables squash, merge, and rebase methods so release flows can select the configured merge strategy.
