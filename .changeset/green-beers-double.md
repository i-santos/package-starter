---
"@i-santos/ship": patch
---

Add release target selection support and hybrid release config schema groundwork.

- add `ship release --target <adapter>` for explicit adapter selection
- add `.ship.json` support for `releaseTargets` and `releasePolicy.stopOnError`
- resolve release adapter by priority: `--target` > first `releaseTargets` entry > `adapter`
- emit warning when multiple `releaseTargets` are configured without `--target`
- validate release target/policy config shape and update docs for hybrid repositories
