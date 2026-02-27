# Contributing

## Local setup

1. Install dependencies: `npm ci`
2. Run checks: `npm run check`

## Release process

1. Add a changeset in each release-impacting PR: `npm run changeset`.
2. Merge PRs into `main`.
3. `.github/workflows/release.yml` opens/updates `chore: release packages`.
4. Merge the release PR to publish.

## Beta process

1. Use branch `release/beta` for prereleases.
2. Run `npm run beta:enter` once on `release/beta`.
3. Publish beta versions via `.github/workflows/release.yml` on `release/beta`.
4. Run `npm run beta:promote` to exit prerelease mode and create stable promotion changeset.
5. Open PR from `release/beta` to `main`.

## Trusted Publishing

If the package does not exist on npm yet, the first publish can be manual:

```bash
npm publish --access public
```

After first publish, configure npm Trusted Publisher with:

- owner
- repository
- workflow file (`.github/workflows/release.yml`)
- branch (`main`)
