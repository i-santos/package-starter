# @i-santos/ship

Portable release/scaffold engine with adapter support.

## Install / Run

```bash
npx @i-santos/ship --name hello-package
npx @i-santos/ship init --dir .
npx @i-santos/ship setup-github --repo owner/repo
npx @i-santos/ship setup-beta --dir .
npx @i-santos/ship setup-npm --dir . --publish-first
npx @i-santos/ship open-pr --auto-merge --watch-checks
npx @i-santos/ship release --yes
```

## Config

Optional project config file: `.ship.json`

```json
{
  "adapter": "npm",
  "adapterModule": "./ship-adapter.js",
  "baseBranch": "main",
  "betaBranch": "release/beta",
  "deploy": {
    "workflow": "release.yml"
  },
  "environment": "staging"
}
```

## npm Adapter (built-in)

Current built-in adapter: `npm`.

Capabilities:

- package scaffold/create (`--name`)
- project init with autonomous setup (`init`)
  - GitHub settings/rulesets/workflows
  - npm auth/package checks and first publish when package is missing
- GitHub setup commands (`setup-github`, `setup-beta`)
- npm setup command (`setup-npm`)
- PR orchestration (`open-pr`)
- release orchestration (`release`)
- stable promotion (`promote-stable`)

## Adapter Extensibility

`ship` is designed for adapter-based evolution.

- native adapters can be added in the `@i-santos/ship` package
- third-party packages can provide adapter implementations and wire them at runtime

## Commands

- `ship --version`
- `ship --name <name> ...`
- `ship init ...`
- `ship setup-github ...`
- `ship setup-beta ...`
- `ship setup-npm ...`
- `ship open-pr ...`
- `ship release ...`
- `ship promote-stable ...`
