# __PACKAGE_NAME__

Package generated from `package-starter` with standardized release scripts.

## Scripts

- `npm run check`
- `npm run registry:start` (default registry: `http://127.0.0.1:4873`)
- `npm run release:beta` (atomic: bump beta + publish + commit)
- `npm run release:stable` (atomic: promote/patch + publish + commit)
- `npm run release:publish` (publish only, no bump/commit)

## Typical flow

1. Ensure git is clean.
2. Set registry if needed: `npm run registry:start`.
3. Run beta release: `npm run release:beta`.
4. Promote to stable when ready: `npm run release:stable`.
