# hello-package

Package created by `package-starter`.

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
2. Merge into `main`.
3. `.github/workflows/release.yml` creates or updates `chore: release packages`.
4. Merge the release PR to publish.

## Beta release flow

1. Create `release/beta` from `main`.
2. Run `npm run beta:enter` once on `release/beta`.
3. Push updates to `release/beta` and let `.github/workflows/release.yml` publish beta versions.
4. When ready for stable, run `npm run beta:promote`, open PR from `release/beta` to `main`, and merge.

## Trusted Publishing

If this package does not exist on npm yet, first publish can be manual:

```bash
npm publish --access public
```

After first publish, configure npm Trusted Publisher:

- owner
- repository
- workflow file (`.github/workflows/release.yml`)
- branch (`main`)
