# package-starter

[![CI](https://github.com/i-santos/package-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/i-santos/package-starter/actions/workflows/ci.yml)
[![npm create-package-starter](https://img.shields.io/npm/v/@i-santos/create-package-starter)](https://www.npmjs.com/package/@i-santos/create-package-starter)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Starter workspace to standardize npm package creation and release with Changesets.

> Note: `release-cli` was removed from this repository. Release automation is now Changesets-only.

## What This Solves

- Reusable package scaffolding with a consistent Changesets setup.
- Release workflow preconfigured for GitHub Actions.
- Version bump control via explicit changesets per PR.

## Architecture

- `packages/create-package-starter`: `create-*` package for new package scaffolding.
- `templates/npm-package`: local workspace template.
- `examples/hello-package`: generated reference package.

## Quickstart

```bash
npm install
npm run create:package -- --name @i-santos/hello-package
cd examples/hello-package
npm run check
npm run changeset
```

## Release Model

1. Add a changeset in your PR: `npm run changeset`.
2. Merge to `main`.
3. GitHub Actions opens/updates the release PR (`chore: release packages`).
4. Merge the release PR to publish on npm.

### Trusted Publishing Setup (npm)

Configure this once for each published package in this repo.

1. Open npm package settings -> **Trusted publishers**.
2. Add a GitHub publisher with:
   - Owner: `i-santos`
   - Repository: `package-starter`
   - Workflow file: `.github/workflows/release.yml`
   - Branch: `main`
3. Save.

After this, the release workflow can publish without `NPM_TOKEN`.

### Protected Branches and Release PR Checks

For protected `main` branches that require CI checks on the release PR, set repository secret `CHANGESETS_GH_TOKEN` (PAT/App token). The workflow uses this token as fallback for release PR commits.

## Migration Guide (existing npm package)

1. Add Changesets dependency and scripts:

```json
{
  "scripts": {
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "npm run check && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.29.7"
  }
}
```

2. Add `.changeset/config.json` and `.github/workflows/release.yml` following this repo templates.
3. Remove custom/manual release scripts and standardize on this flow.

## Creating New Packages

- Local workspace generator:
  - `npm run create:package -- --name @i-santos/swarm`
- Published `create-*` package:
  - `npx @i-santos/create-package-starter --name @i-santos/swarm`

## Troubleshooting

- Release PR checks not reporting: configure `CHANGESETS_GH_TOKEN`.
- Publish auth errors: verify npm Trusted Publisher for package/workflow/branch.

## Branch & PR Policy

- Keep `main` protected.
- Require PR review + CI checks before merge.
- Use conventional commit prefixes.
