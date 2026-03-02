# @i-santos/ship

Reusable release-cycle orchestration engine.

## Install / Run

```bash
npx @i-santos/ship release-cycle --yes
npx @i-santos/ship open-pr --auto-merge --watch-checks
```

## Config

Optional project config file: `.ship.json`

```json
{
  "adapter": "npm",
  "baseBranch": "main",
  "betaBranch": "release/beta",
  "deploy": {
    "workflow": "deploy.yml"
  },
  "environment": "staging"
}
```

Current supported adapter:

- `npm`

## Commands

- `ship --version`
- `ship open-pr ...`
- `ship release-cycle ...`

## Notes

- `@i-santos/npmstack` wraps this package via `npmstack ship ...`.
- This package focuses on orchestration and adapter-driven release verification.
