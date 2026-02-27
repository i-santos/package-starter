# package-starter

[![CI](https://github.com/i-santos/package-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/i-santos/package-starter/actions/workflows/ci.yml)
[![npm release-cli](https://img.shields.io/npm/v/@i-santos/release-cli)](https://www.npmjs.com/package/@i-santos/release-cli)
[![npm create-package-starter](https://img.shields.io/npm/v/@i-santos/create-package-starter)](https://www.npmjs.com/package/@i-santos/create-package-starter)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Starter workspace to standardize npm package creation and release.

## What This Solves

- Reusable package scaffolding with a consistent release script set.
- Atomic local fallback release commands (`beta` / `stable`).
- Official release pipeline using Changesets + GitHub Actions.

## Architecture

- `packages/release-cli`: release command runner (`beta`, `stable`, `publish`, `registry`).
- `packages/create-package-starter`: `create-*` package for new package scaffolding.
- `templates/npm-package`: local workspace template.
- `examples/hello-package`: generated reference package.

## Quickstart

```bash
npm install
npm run create:package -- --name @i-santos/hello-package
cd examples/hello-package
npm run check
npm run release:beta
```

## Release Model

### Official (production)

- Add changeset in PR: `npm run changeset`
- Merge to `main`
- GitHub Actions opens/updates release PR and publishes on merge
- npm publish authentication is done via npm Trusted Publishing (OIDC), not long-lived tokens

### Trusted Publishing Setup (npm)

Configure this once for each package (`@i-santos/release-cli` and `@i-santos/create-package-starter`):

1. Open npm package settings -> **Trusted publishers**.
2. Add a GitHub publisher with:
   - Owner: `i-santos`
   - Repository: `package-starter`
   - Workflow file: `.github/workflows/release.yml`
   - Branch: `main`
3. Save and repeat for the second package.

After this, the release workflow can publish without `NPM_TOKEN`.

### Manual fallback (local)

Use `release-cli` scripts inside a package:

- `npm run release:beta`
- `npm run release:stable`
- `npm run release:publish`

`beta` and `stable` are atomic: if publish fails, version rollback is applied and no release commit is created.

## Migration Guide (existing npm package)

1. Install dev dependency:

```bash
npm i -D @i-santos/release-cli
```

2. Bootstrap CI/CD release layer (Changesets + GitHub Actions):

```bash
npx release-cli setup
```

3. (Optional) Add scripts manually:

```json
{
  "scripts": {
    "release:beta": "release-cli beta",
    "release:stable": "release-cli stable",
    "release:publish": "release-cli publish",
    "registry:start": "release-cli registry http://127.0.0.1:4873"
  }
}
```

4. Remove old release scripts and standardize on this flow.

## Creating New Packages

- Local workspace generator:
  - `npm run create:package -- --name @i-santos/swarm`
- Published `create-*` package:
  - `npx @i-santos/create-package-starter --name @i-santos/swarm`

## Verdaccio (Optional Local Dev)

- Set package registry quickly:
  - `npm run registry:start`
- Or direct command:
  - `npx @i-santos/release-cli registry http://127.0.0.1:4873`
- Optional host-level `.npmrc`:
  - `@i-santos:registry=http://127.0.0.1:4873`

## Troubleshooting

- `Git is not clean`: commit/stash changes before `release:beta` or `release:stable`.
- Publish auth errors: run `npm login` for npmjs.org (or set proper token in CI).
- Registry mismatch: ensure `.npmrc` has expected `registry=` value.

## Branch & PR Policy

- Keep `main` protected.
- Require PR review + CI checks before merge.
- Use conventional commit prefixes.

## Roadmap

- Add integration tests against a temporary local npm registry in CI.
- Add optional changelog sections by package domain.
