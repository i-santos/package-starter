# @i-santos/create-package-starter

Scaffold new npm packages with a standardized Changesets release workflow.

## Install / Run

```bash
npx @i-santos/create-package-starter --name hello-package
npx @i-santos/create-package-starter --name @i-santos/swarm
```

## Options

- `--name <name>` (required, supports `pkg` and `@scope/pkg`)
- `--out <directory>` (default: current directory)

## Output

Generated package includes:

- `changeset`
- `version-packages`
- `release`
- `.github/workflows/release.yml`
- `.changeset/config.json`

plus a minimal README, CHANGELOG, `.gitignore`, and check script.

## Notes

- For scoped names, folder uses the short package name.
  - Example: `@i-santos/swarm` creates `./swarm`.
- Template follows `npm init -y` behavior by default (no `private` field).
