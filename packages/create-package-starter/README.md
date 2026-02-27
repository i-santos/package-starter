# @i-santos/create-package-starter

Scaffold new npm packages with a consistent release workflow.

## Install / Run

```bash
npx @i-santos/create-package-starter --name hello-package
npx @i-santos/create-package-starter --name @i-santos/swarm
```

## Options

- `--name <name>` (required, supports `pkg` and `@scope/pkg`)
- `--out <directory>` (default: current directory)
- `--release-cli-pkg <package>` (default: `@i-santos/release-cli`)
- `--release-cli-version <version>` (default: `^0.1.0`)

## Output

Generated package includes:

- `release:beta`
- `release:stable`
- `release:publish`
- `registry:start`

plus a minimal README, CHANGELOG, `.gitignore`, and check script.

## Notes

- For scoped names, folder uses the short package name.
  - Example: `@i-santos/swarm` creates `./swarm`.
- Template follows `npm init -y` behavior by default (no `private` field).
