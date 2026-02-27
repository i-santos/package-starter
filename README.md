# package-starter

[![CI](https://github.com/i-santos/package-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/i-santos/package-starter/actions/workflows/ci.yml)
[![npm create-package-starter](https://img.shields.io/npm/v/@i-santos/create-package-starter)](https://www.npmjs.com/package/@i-santos/create-package-starter)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Starter workspace to standardize npm package creation and migration with Changesets.

## What This Solves

- Standardized npm package DX with one scaffold/migration command.
- Built-in CI and release workflows based on Changesets.
- Managed repo docs and standards files for low-touch setup.
- Optional GitHub repository defaults/ruleset automation.

## Architecture

- `packages/create-package-starter`: published CLI package.
- `templates/npm-package`: workspace-local template used by `npm run create:package`.
- `examples/hello-package`: generated reference package.

## Quickstart

```bash
npm install
npm run create:package -- --name @i-santos/hello-package
cd examples/hello-package
npm run check
npm run changeset
```

Published CLI:

```bash
npx @i-santos/create-package-starter --name @i-santos/swarm
npx @i-santos/create-package-starter init --dir ./existing-package
npx @i-santos/create-package-starter setup-github --repo i-santos/swarm --dry-run
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
npx @i-santos/create-package-starter init --dir .
```

Useful flags:

- `--force` to overwrite managed files and managed script/dependency keys
- `--cleanup-legacy-release` to remove legacy release script keys (`release:beta*`, `release:stable*`, `release:promote*`, `release:rollback*`, `release:dist-tags`)
- `--default-branch <branch>` to change base branch defaults

## GitHub Defaults Automation

Optional command:

```bash
npx @i-santos/create-package-starter setup-github --repo i-santos/firestack
```

Applies baseline repository settings and creates/updates a main branch ruleset. Use `--dry-run` to preview changes.

## Branch & PR Policy

- Keep `main` protected.
- Require PR review + CI checks before merge.
- Use conventional commit prefixes.
