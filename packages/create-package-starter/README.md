# @i-santos/create-package-starter

Scaffold new npm packages with a standardized Changesets release workflow.

## Install / Run

```bash
npx @i-santos/create-package-starter --name hello-package
npx @i-santos/create-package-starter --name @i-santos/swarm
npx @i-santos/create-package-starter init --dir ./existing-package
```

## Options

Create new package:

- `--name <name>` (required, supports `pkg` and `@scope/pkg`)
- `--out <directory>` (default: current directory)

Bootstrap existing package:

- `init`
- `--dir <directory>` (default: current directory)
- `--force` (overwrite managed files/scripts/dependency keys)

## Output

Generated package includes:

- `changeset`
- `version-packages`
- `release`
- `.github/workflows/release.yml`
- `.changeset/config.json`

plus a minimal README, CHANGELOG, `.gitignore`, and check script.

## Existing Project Bootstrap

`init` configures an existing npm package directory in-place:

- ensures scripts `changeset`, `version-packages`, `release`
- ensures `@changesets/cli` in `devDependencies`
- creates (or preserves) `.changeset/config.json`, `.changeset/README.md`, and `.github/workflows/release.yml`
- default mode is safe-merge; use `--force` to overwrite managed files/keys

## Notes

- For scoped names, folder uses the short package name.
  - Example: `@i-santos/swarm` creates `./swarm`.
- Template follows `npm init -y` behavior by default (no `private` field).
