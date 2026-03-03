---
"@i-santos/ship": patch
---

Add multi-target release execution for hybrid repositories.

- add `ship release --targets <single|auto>` (`single` default)
- execute all configured `releaseTargets` in order when `--targets auto`
- apply `releasePolicy.stopOnError` (`true` stops early, `false` continues and fails at the end if needed)
- keep `--target` for explicit single-target execution
- add tests and docs for target plan resolution and stopOnError behavior
