# @i-santos/create-package-starter

Scaffold and standardize npm packages with a Changesets-first release workflow.

## Install / Run

```bash
npx @i-santos/create-package-starter --name hello-package
npx @i-santos/create-package-starter --name @i-santos/swarm --default-branch main --release-auth pat
npx @i-santos/create-package-starter init --dir ./existing-package
npx @i-santos/create-package-starter init --dir . --with-github --with-beta --with-npm --release-auth app --yes
npx @i-santos/create-package-starter setup-github --repo i-santos/firestack --dry-run
npx @i-santos/create-package-starter setup-beta --dir . --beta-branch release/beta --release-auth pat
npx @i-santos/create-package-starter open-pr --auto-merge --watch-checks
npx @i-santos/create-package-starter release-cycle --yes
npx @i-santos/create-package-starter promote-stable --dir . --type patch --summary "Promote beta to stable"
npx @i-santos/create-package-starter setup-npm --dir ./existing-package --publish-first
```

## Commands

Create new package:

- `--name <name>` (required, supports `pkg` and `@scope/pkg`)
- `--out <directory>` (default: current directory)
- `--default-branch <branch>` (default: `main`)
- `--release-auth <github-token|pat|app|manual-trigger>` (default: `pat`)

Bootstrap existing package:

- `init`
- `--dir <directory>` (default: current directory)
- `--force` (overwrite managed files/script keys/dependency versions)
- `--cleanup-legacy-release` (remove `release:beta*`, `release:stable*`, `release:promote*`, `release:rollback*`, `release:dist-tags`)
- `--scope <scope>` (optional placeholder helper for docs/templates)
- `--default-branch <branch>` (default: `main`)
- `--release-auth <github-token|pat|app|manual-trigger>` (default: `pat`)
- `--beta-branch <branch>` (default: `release/beta`)
- `--with-github` (run GitHub setup in same flow)
- `--with-npm` (run npm setup in same flow)
- `--with-beta` (run beta flow setup; implies `--with-github`)
- `--repo <owner/repo>` (optional; inferred from `remote.origin.url` when omitted)
- `--ruleset <path>` (optional JSON override for main ruleset payload)
- `--dry-run` (preview planned operations without mutating)
- `--yes` (skip confirmation prompts)

Configure GitHub repository settings:

- `setup-github`
- `--repo <owner/repo>` (optional; inferred from `remote.origin.url` when omitted)
- `--default-branch <branch>` (default: `main`)
- `--ruleset <path>` (optional JSON override)
- `--dry-run` (prints intended operations only)

Bootstrap beta release flow:

- `setup-beta`
- `--dir <directory>` (default: current directory)
- `--beta-branch <branch>` (default: `release/beta`)
- `--default-branch <branch>` (default: `main`)
- `--repo <owner/repo>` (optional; inferred from `remote.origin.url` when omitted)
- `--release-auth <github-token|pat|app|manual-trigger>` (default: `pat`)
- `--force` (overwrite managed scripts/workflow)
- `--dry-run` (prints intended operations only)
- `--yes` (skip interactive confirmations)

Create/update pull requests:

- `open-pr`
- `--repo <owner/repo>` (optional; inferred from `remote.origin.url` when omitted)
- `--base <branch>` (default: `release/beta`, or `main` when head is `release/beta`)
- `--head <branch>` (default: current branch)
- `--title <text>` (default: latest commit subject)
- `--body <text>` (highest priority body source)
- `--body-file <path>`
- `--template <path>` (default fallback `.github/PULL_REQUEST_TEMPLATE.md`)
- `--draft`
- `--auto-merge`
- `--watch-checks`
- `--check-timeout <minutes>` (default: `30`)
- `--yes`
- `--dry-run`

Orchestrate release cycle:

- `release-cycle`
- `--repo <owner/repo>` (optional; inferred from `remote.origin.url` when omitted)
- `--mode <auto|open-pr|publish>` (default: `auto`)
- `--head <branch>`
- `--base <branch>`
- `--title <text>`
- `--body-file <path>`
- `--draft`
- `--auto-merge` (default behavior: enabled)
- `--watch-checks` (default behavior: enabled)
- `--check-timeout <minutes>` (default: `30`)
- `--merge-when-green` (default behavior: enabled)
- `--merge-method <squash|merge|rebase>` (default: `squash`)
- `--wait-release-pr` (default behavior: enabled)
- `--release-pr-timeout <minutes>` (default: `30`)
- `--merge-release-pr` (default behavior: enabled)
- `--yes`
- `--dry-run`

Prepare stable promotion from beta track:

- `promote-stable`
- `--dir <directory>` (default: current directory)
- `--type <patch|minor|major>` (default: `patch`)
- `--summary <text>` (default: `Promote beta track to stable release.`)
- `--dry-run` (prints intended operations only)

Bootstrap npm publishing:

- `setup-npm`
- `--dir <directory>` (default: current directory)
- `--publish-first` (run `npm publish --access public` only when package is not found on npm)
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
- `README.md` and `CONTRIBUTING.md` are create-only in `init` (never overwritten).
- Existing `.gitignore` is merged by appending missing template entries.
- Existing custom `check` script is preserved unless `--force`.
- Existing `@changesets/cli` version is preserved unless `--force`.
- Lowercase `.github/pull_request_template.md` is recognized as an existing equivalent template.
- `npm install` runs at the end of `init` (or is previewed in `--dry-run`).
- If no `--with-*` flags are provided:
  - TTY: asks interactively which external setup to run (`github`, `npm`, `beta`).
  - non-TTY: runs local init only and prints warning with next steps.
- If `--release-auth` is omitted:
  - TTY: asks explicitly to choose release auth mode (`pat`, `app`, `github-token`, `manual-trigger`).
  - non-TTY: defaults to `pat` and prints warning.
- Integrated mode (`--with-github/--with-npm/--with-beta`) pre-validates everything first (gh auth, npm auth, repo/branch/ruleset/package checks) and fails fast before local mutations if validation fails.
- Integrated mode asks confirmation for sensitive external operations and ruleset/branch adoption conflicts (unless `--yes`).

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
- set Actions workflow default permissions to `write` (with PR review approvals enabled for workflows)
- create/update branch ruleset with required PR, 0 approvals by default, stale review dismissal, resolved conversations, and deletion/force-push protection

If `gh` is missing or unauthenticated, command exits non-zero with actionable guidance.

## setup-beta Behavior

`setup-beta` configures prerelease automation:

- adds beta scripts to `package.json`
- creates/preserves `.github/workflows/release.yml` with beta+stable branch triggers
- creates/preserves `.github/workflows/ci.yml` with beta+stable branch triggers
- creates/preserves `.github/workflows/auto-retarget-pr.yml` to retarget PR bases automatically (`release/beta -> main`, all other branches -> `release/beta`)
- supports release auth strategy for Changesets branch updates: `pat`, `app`, `github-token`, or `manual-trigger`
- ensures `release/beta` branch exists remotely (created from default branch if missing)
- applies beta branch protection ruleset on GitHub with stable required check context (`required-check`)
- asks for confirmation before mutating repository settings and again before overwriting existing beta ruleset
- supports safe-merge by default and `--force` overwrite
- supports configurable beta branch (`release/beta` by default)

## open-pr Behavior

`open-pr` removes repetitive manual PR steps:

- resolves repo + branch defaults
- pushes branch (set upstream when needed)
- creates PR or updates existing PR for same `head -> base`
- generates deterministic PR body when explicit body is not provided
- optionally enables auto-merge
- optionally watches checks until green/fail/timeout

Body source priority:
1. `--body`
2. `--body-file`
3. `--template` (or `.github/PULL_REQUEST_TEMPLATE.md`)
4. deterministic generated body

## release-cycle Behavior

`release-cycle` orchestrates code PR and release PR progression end-to-end.

Default mode is `auto`:
- if current branch starts with `changeset-release/` => `publish`
- else if exactly one open `changeset-release/*` PR exists => `publish`
- else => `open-pr`

For `open-pr` mode:
- runs open-pr flow
- can merge code PR when green
- can wait for release PR creation (`changeset-release/*`)
- can watch checks and merge release PR when green

For `publish` mode:
- resolves release PR directly
- watches checks
- merges when green (policy permitting)

The command is policy-aware:
- never bypasses required checks/reviews/rulesets
- fails fast with actionable diagnostics when blocked

`release-auth` modes:
- `pat` (recommended default): uses `CHANGESETS_GH_TOKEN` fallback to `GITHUB_TOKEN`
- `app`: generates token via GitHub App (`GH_APP_ID` or `GH_APP_CLIENT_ID`, plus `GH_APP_PRIVATE_KEY`)
- `github-token`: uses built-in `GITHUB_TOKEN` only
- `manual-trigger`: uses built-in token and expects manual retrigger (empty commit) if release PR checks stay pending

If `--release-auth` is omitted in interactive mode, setup prompts for explicit mode selection.

### release-auth decision table

| Mode | When to use | Required secrets | Trade-off |
| --- | --- | --- | --- |
| `pat` | Fastest setup for solo/small repos | `CHANGESETS_GH_TOKEN` | Simpler, but relies on PAT lifecycle/rotation |
| `app` | Preferred for long-lived org/repo automation | `GH_APP_PRIVATE_KEY` + (`GH_APP_CLIENT_ID` or `GH_APP_ID`) | More setup, better long-term security and governance |
| `github-token` | Minimal setup / experiments | none | Some downstream workflow retriggers may not happen |
| `manual-trigger` | Accept manual CI retrigger on release PR updates | none | Extra manual empty-commit step when checks are pending |

`GITHUB_TOKEN` can create/update release PRs in many cases, but events emitted by that workflow token may not retrigger downstream workflows (anti-recursion behavior).  
For reliable retriggers on `changeset-release/*` updates, prefer `pat` or `app`.

GitHub App docs:
- Overview: https://docs.github.com/apps
- Create app: https://docs.github.com/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- Install app: https://docs.github.com/apps/using-github-apps/installing-your-own-github-app
- Manage secrets: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions
- Project guide: https://github.com/i-santos/package-starter/blob/main/docs/release-auth-github-app.md
- PR orchestration guide: https://github.com/i-santos/package-starter/blob/main/docs/pr-orchestration.md

## promote-stable Behavior

`promote-stable` prepares stable promotion from prerelease mode:

- validates `.changeset/pre.json` exists
- runs `changeset pre exit`
- creates a promotion changeset (`patch|minor|major`)
- prints next step guidance for opening beta->main PR

## setup-npm Behavior

`setup-npm` validates npm publish readiness:

- checks npm CLI availability
- checks npm authentication (`npm whoami`)
- checks whether package already exists on npm
- optionally performs first publish (`--publish-first`)
- prints next steps for Trusted Publisher configuration

Important: Trusted Publisher still needs manual setup in npm package settings.

When npm setup runs inside orchestrated `init --with-npm`, first publish is automatic when package is not found on npm.

## Trusted Publishing Note

If package does not exist on npm yet, first publish may be manual:

```bash
npm publish --access public
```

After first publish, configure npm Trusted Publisher using your owner, repository, workflow file (`.github/workflows/release.yml`), and branch (`main` by default).
