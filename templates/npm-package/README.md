# __PACKAGE_NAME__

Package generated from `package-starter` with a standardized Changesets release flow.

## Scripts

- `npm run check`
- `npm run changeset`
- `npm run version-packages`
- `npm run release`

## Typical flow

1. Add a changeset in your feature PR: `npm run changeset`.
2. Merge to `main`.
3. GitHub Actions opens/updates `chore: release packages`.
4. Merge release PR to publish.

## CI/CD release

- Ready-to-use workflow: `.github/workflows/release.yml`
- Changesets config: `.changeset/config.json`
