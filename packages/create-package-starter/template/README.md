# __PACKAGE_NAME__

Package created by `@i-santos/create-package-starter`.

## Scripts

- `npm run check`
- `npm run changeset`
- `npm run version-packages`
- `npm run release`
- `npm run beta:enter`
- `npm run beta:exit`
- `npm run beta:publish`
- `npm run beta:promote`

## Release flow

1. Add a changeset in your PR: `npm run changeset`.
2. Merge into `__DEFAULT_BRANCH__`.
3. `.github/workflows/release.yml` creates or updates `chore: release packages`.
4. Merge the release PR to publish.

## Beta release flow

1. Create `__BETA_BRANCH__` from `__DEFAULT_BRANCH__`.
2. Run `npm run beta:enter` once on `__BETA_BRANCH__`.
3. Push updates to `__BETA_BRANCH__` and let `.github/workflows/release-beta.yml` publish beta versions.
4. When ready for stable, run `npm run beta:promote`, open PR from `__BETA_BRANCH__` to `__DEFAULT_BRANCH__`, and merge.

## Trusted Publishing

If this package does not exist on npm yet, first publish can be manual:

```bash
npm publish --access public
```

After first publish, configure npm Trusted Publisher:

- owner
- repository
- workflow file (`.github/workflows/release.yml`)
- branch (`__DEFAULT_BRANCH__`)
