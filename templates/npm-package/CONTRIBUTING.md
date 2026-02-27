# Contributing

## Local setup

1. Install dependencies: `npm ci`
2. Run checks: `npm run check`

## Release process

1. Add a changeset in each release-impacting PR: `npm run changeset`.
2. Merge PRs into `__DEFAULT_BRANCH__`.
3. `.github/workflows/release.yml` opens/updates `chore: release packages`.
4. Merge the release PR to publish.

## Beta process

1. Use branch `__BETA_BRANCH__` for prereleases.
2. Run `npm run beta:enter` once on `__BETA_BRANCH__`.
3. Publish beta versions via `.github/workflows/release-beta.yml`.
4. Run `npm run beta:promote` to exit prerelease mode and create stable promotion changeset.
5. Open PR from `__BETA_BRANCH__` to `__DEFAULT_BRANCH__`.

## Trusted Publishing

If the package does not exist on npm yet, the first publish can be manual:

```bash
npm publish --access public
```

After first publish, configure npm Trusted Publisher with:

- owner
- repository
- workflow file (`.github/workflows/release.yml`)
- branch (`__DEFAULT_BRANCH__`)
