# ship

[![CI](https://github.com/i-santos/ship/actions/workflows/ci.yml/badge.svg)](https://github.com/i-santos/ship/actions/workflows/ci.yml)
[![npm ship](https://img.shields.io/npm/v/@i-santos/ship)](https://www.npmjs.com/package/@i-santos/ship)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Starter workspace to standardize npm package creation and migration with Changesets.

## Documentation

- Complete API and usage guide: [docs/ship-api.md](https://github.com/i-santos/ship/blob/main/docs/ship-api.md)
- PR orchestration deep dive: [docs/pr-orchestration.md](https://github.com/i-santos/ship/blob/main/docs/pr-orchestration.md)
- Release auth (GitHub App): [docs/release-auth-github-app.md](https://github.com/i-santos/ship/blob/main/docs/release-auth-github-app.md)

## What This Solves

- Standardized npm package DX with one scaffold/migration command.
- Built-in CI and release workflows based on Changesets.
- Managed repo docs and standards files for low-touch setup.
- Optional GitHub repository defaults/ruleset automation.

## Architecture

- Root package `@i-santos/ship`: published CLI and reusable release orchestration engine.
- Adapter model: `open-pr` and `release` run on adapter capabilities (`npm` built-in, external via `.ship.json` + `adapterModule`).
- `template/`: managed scaffold baseline used by the CLI.

## Quickstart

```bash
npm install
npx @i-santos/ship --name @i-santos/hello-package
```

Published CLI:

```bash
npx @i-santos/ship --name @i-santos/swarm
npx @i-santos/ship init --dir ./existing-package
npx @i-santos/ship init --dir . --with-github --with-beta --with-npm --release-auth pat --yes
npx @i-santos/ship setup-github --repo i-santos/swarm --dry-run
npx @i-santos/ship setup-beta --dir . --beta-branch release/beta --release-auth pat
npx @i-santos/ship promote-stable --dir . --type patch --summary "Promote beta to stable"
npx @i-santos/ship setup-npm --dir ./existing-package --publish-first
```

## Default Release Model

1. Add a changeset in your PR: `npm run changeset`.
2. Merge to `main`.
3. GitHub Actions opens/updates release PR (`chore: release packages`).
4. Merge release PR to publish.

## Trusted Publishing Setup (npm)

If package does not exist on npm yet, first publish can be manual:

```bash
npm publish --access public
```

Then configure npm Trusted Publisher for the package:

- owner
- repository
- workflow file (`.github/workflows/release.yml`)
- branch (`main`)

After this, future releases should happen via Changesets release PR workflow.

## Migration Guide (existing npm package)

One command:

```bash
npx @i-santos/ship init --dir .
```

Useful flags:

- `--force` to overwrite managed files and managed script/dependency keys
- `--cleanup-legacy-release` to remove legacy release script keys (`release:beta*`, `release:stable*`, `release:promote*`, `release:rollback*`, `release:dist-tags`)
- `--default-branch <branch>` to change base branch defaults
- `--with-github --with-beta --with-npm` to run integrated infra setup inside `init`
- `--yes` to skip confirmations in non-interactive contexts

## GitHub Defaults Automation

Optional command:

```bash
npx @i-santos/ship setup-github --repo i-santos/firestack
```

Applies baseline repository settings and creates/updates a main branch ruleset. Use `--dry-run` to preview changes.

## Beta Release Automation

Use a dedicated prerelease branch (for example `release/beta`) instead of `main`.

Bootstrap beta flow:

```bash
npx @i-santos/ship setup-beta --dir . --beta-branch release/beta
```

By default the command asks for confirmation before mutating GitHub settings/rulesets.
Use `--yes` only for non-interactive/automation runs.

Promote beta to stable:

```bash
npx @i-santos/ship promote-stable --dir . --type patch --summary "Promote beta to stable"
```

This exits prerelease mode and creates an explicit promotion changeset before opening PR from beta branch to `main`.
Keep npm Trusted Publisher configured for `release.yml` (single workflow), and run that workflow on both `main` and `release/beta`.
`setup-beta` also aligns CI trigger branches and applies beta ruleset with required `required-check` status.
`setup-beta` also provisions an auto-retarget workflow so PR bases follow this policy automatically: `release/beta -> main`, all other branches -> `release/beta`.
`setup-beta`/`init` also support release auth strategy via `--release-auth`: `pat`, `app`, `github-token`, `manual-trigger`.

## npm First Publish Bootstrap

Optional command:

```bash
npx @i-santos/ship setup-npm --dir .
```

`setup-npm` checks npm auth and package existence, and can run first publish when needed:

```bash
npx @i-santos/ship setup-npm --dir . --publish-first
```

Trusted Publisher setup on npm remains a manual step after first publish.

## Branch & PR Policy

- Keep `main` protected.
- Require PR review + CI checks before merge.
- Use conventional commit prefixes.
