# __PACKAGE_NAME__

Package created by `package-starter`.

## Scripts

- `npm run check`
- `npm run changeset`
- `npm run version-packages`
- `npm run release`

## Release flow

1. Add a changeset in your PR: `npm run changeset`.
2. Merge into `__DEFAULT_BRANCH__`.
3. `.github/workflows/release.yml` creates or updates `chore: release packages`.
4. Merge the release PR to publish.

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
