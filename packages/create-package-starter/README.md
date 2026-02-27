# @i-santos/create-package-starter

Scaffold and standardize npm packages with a Changesets-first release workflow.

## Install / Run

```bash
npx @i-santos/create-package-starter --name hello-package
npx @i-santos/create-package-starter --name @i-santos/swarm --default-branch main
npx @i-santos/create-package-starter init --dir ./existing-package
npx @i-santos/create-package-starter setup-github --repo i-santos/firestack --dry-run
```

## Commands

Create new package:

- `--name <name>` (required, supports `pkg` and `@scope/pkg`)
- `--out <directory>` (default: current directory)
- `--default-branch <branch>` (default: `main`)

Bootstrap existing package:

- `init`
- `--dir <directory>` (default: current directory)
- `--force` (overwrite managed files/script keys/dependency versions)
- `--cleanup-legacy-release` (remove `release:beta*`, `release:stable*`, `release:promote*`, `release:rollback*`, `release:dist-tags`)
- `--scope <scope>` (optional placeholder helper for docs/templates)
- `--default-branch <branch>` (default: `main`)

Configure GitHub repository settings:

- `setup-github`
- `--repo <owner/repo>` (optional; inferred from `remote.origin.url` when omitted)
- `--default-branch <branch>` (default: `main`)
- `--ruleset <path>` (optional JSON override)
- `--dry-run` (prints intended operations only)

## Managed Standards

The generated and managed baseline includes:

- `package.json` scripts: `check`, `changeset`, `version-packages`, `release`
- `@changesets/cli` in `devDependencies`
- `.changeset/config.json`
- `.changeset/README.md`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/CODEOWNERS`
- `CONTRIBUTING.md`
- `README.md`
- `.gitignore`

## Init Behavior

- Default mode is safe-merge: existing managed files and keys are preserved.
- `--force` overwrites managed files and managed script/dependency keys.
- Existing custom `check` script is preserved unless `--force`.
- Existing `@changesets/cli` version is preserved unless `--force`.
- Lowercase `.github/pull_request_template.md` is recognized as an existing equivalent template.

## Output Summary Contract

All commands print a deterministic summary with:

- files created
- files overwritten
- files skipped
- scripts updated/skipped/removed
- dependencies updated/skipped
- warnings

## setup-github Behavior

`setup-github` applies repository defaults via `gh` API:

- default branch
- delete branch on merge
- auto-merge enabled
- squash-only merge policy
- create/update branch ruleset with required PR, 1 approval, stale review dismissal, resolved conversations, and deletion/force-push protection

If `gh` is missing or unauthenticated, command exits non-zero with actionable guidance.

## Trusted Publishing Note

If package does not exist on npm yet, first publish may be manual:

```bash
npm publish --access public
```

After first publish, configure npm Trusted Publisher using your owner, repository, workflow file (`.github/workflows/release.yml`), and branch (`main` by default).
