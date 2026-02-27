# @i-santos/release-cli

CLI to standardize npm package releases with atomic `beta` and `stable` flows.

## Install

```bash
npm i -D @i-santos/release-cli
```

## Commands

- `release-cli beta`
- `release-cli stable`
- `release-cli publish [tag]`
- `release-cli registry [url]`
- `release-cli setup`

## Behavior

### `release-cli beta`

- Requires a clean git working tree.
- Bumps prerelease version with `beta` preid.
- Publishes with `npm publish --tag beta`.
- Creates commit `chore(release): vX.Y.Z-beta.N` only after successful publish.
- If publish fails, rollback is applied and no release commit is created.

### `release-cli stable`

- Requires a clean git working tree.
- If current version is `X.Y.Z-beta.N`, promotes to `X.Y.Z`.
- If already stable, bumps patch.
- Publishes with `npm publish`.
- Creates commit `chore(release): vX.Y.Z` only after successful publish.
- If publish fails, rollback is applied and no release commit is created.

### `release-cli publish [tag]`

- Publish-only command.
- Does not bump version.
- Does not create commits.

### `release-cli registry [url]`

- Updates package `.npmrc` with `registry=<url>`.
- Default URL: `http://127.0.0.1:4873`.

### `release-cli setup`

- Creates `.github/workflows/release.yml` (Changesets + GitHub Actions).
- Creates `.changeset/config.json` and `.changeset/README.md`.
- Adds missing scripts to `package.json`:
  - `changeset`
  - `version-packages`
  - `release`
  - `release:beta`
  - `release:stable`
  - `release:publish`
  - `registry:start`
- Adds `@changesets/cli` to `devDependencies` when missing.
- Idempotent: existing files/scripts are preserved.

## Typical scripts

```json
{
  "scripts": {
    "release:beta": "release-cli beta",
    "release:stable": "release-cli stable",
    "release:publish": "release-cli publish",
    "registry:start": "release-cli registry http://127.0.0.1:4873",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "npm run check && npm run release:publish"
  }
}
```
