# Ship API And Usage Guide

This document is the complete reference for using `ship` as a CLI and as a Node module.

## Purpose

`ship` is a release/scaffold orchestrator for npm packages that use:

- GitHub (PRs, checks, auto-merge, workflows, rulesets)
- Changesets (versioning + release PRs)
- npm registry publishing (beta/stable validation)

It is designed to reduce manual release operations and standardize release workflows.

## What Ship Automates

- project bootstrap (`init`)
- GitHub repository + beta flow setup (`setup-github`)
- npm publishing setup and optional first publish (`setup-npm`)
- pull request orchestration (`open-pr`)
- end-to-end release orchestration (`release`)
- stable promotion workflow (`promote-stable`)
- deterministic task state lifecycle bootstrap (`task`)

## Mental Model

Think about `ship` in 4 phases:

1. Prepare project infra (`init`)
2. Create/update code PR (`open-pr`)
3. Run release progression (`release`)
4. Promote beta to stable when needed (`promote-stable`)

`release` is the core operational command. It coordinates PR flow, checks, merges, and npm validation.

## Recommended Workflow (Minimal Flags)

### 1. Bootstrap once

```bash
ship init --dir . --with-github --with-beta --with-npm --yes
```

### 2. Daily feature flow

From your feature branch:

```bash
ship open-pr --auto-merge --watch-checks --yes
```

Then run:

```bash
ship release --yes
```

### 3. Promote beta to stable

From `release/beta`:

```bash
ship release --promote-stable --promote-type patch --yes
```

## CLI Reference

## `ship --name <name>`

Creates a new package from the managed template.

Main flags:

- `--name <name>` required
- `--out <directory>` output directory
- `--default-branch <branch>` default branch for generated config
- `--release-auth <github-token|pat|app|manual-trigger>`

## `ship init`

Configures an existing package directory to ship standards.

Main flags:

- `--dir <directory>`
- `--force`
- `--cleanup-legacy-release`
- `--default-branch <branch>`
- `--with-github`
- `--with-beta`
- `--with-npm`
- `--repo <owner/repo>`
- `--release-auth <github-token|pat|app|manual-trigger>`
- `--yes`
- `--dry-run`

## `ship setup-github`

Applies GitHub repository defaults + beta flow setup.

Main flags:

- `--dir <directory>`
- `--repo <owner/repo>`
- `--default-branch <branch>`
- `--beta-branch <branch>`
- `--ruleset <path>`
- `--release-auth <github-token|pat|app|manual-trigger>`
- `--yes`
- `--dry-run`

## `ship setup-npm`

Validates npm auth/package status and can run first publish.

Main flags:

- `--dir <directory>`
- `--publish-first`
- `--dry-run`

## `ship open-pr`

Creates or updates PR for current branch.

Main flags:

- `--repo <owner/repo>`
- `--base <branch>`
- `--head <branch>`
- `--title <text>`
- `--pr-description <text>` alias: `--body`
- `--pr-description-file <path>` alias: `--body-file`
- `--template <path>`
- `--draft`
- `--auto-merge`
- `--watch-checks`
- `--check-timeout <minutes>`
- `--yes`
- `--dry-run`

Body source priority:

1. `--pr-description`
2. `--pr-description-file`
3. `--template`
4. deterministic generated markdown

## `ship release`

Main orchestration command for PR/release progression.

Main flags:

- `--repo <owner/repo>`
- `--mode <auto|open-pr|publish>`
- `--phase <code|full>`
- `--track <auto|beta|stable>`
- `--promote-stable`
- `--promote-type <patch|minor|major>`
- `--promote-summary <text>`
- `--head <branch>`
- `--base <branch>`
- `--title <text>`
- `--pr-description <text>` alias: `--body`
- `--pr-description-file <path>` alias: `--body-file`
- `--npm-package <name>` (repeatable)
- `--update-pr-description`
- `--draft`
- `--auto-merge`
- `--watch-checks`
- `--check-timeout <minutes>`
- `--confirm-merges`
- `--merge-when-green`
- `--merge-method <squash|merge|rebase>`
- `--wait-release-pr`
- `--release-pr-timeout <minutes>`
- `--merge-release-pr`
- `--verify-npm`
- `--confirm-cleanup`
- `--sync-base <auto|rebase|merge|off>`
- `--no-resume`
- `--no-cleanup`
- `--yes`
- `--dry-run`

Operational behavior:

- Detects mode automatically when `--mode auto`
- Opens/updates code PR and optionally merges with auto-merge
- Waits for release PR (`changeset-release/*`) when needed
- Watches checks and merge readiness
- Validates npm publication and dist-tags
- Performs local cleanup after successful flow

## `ship promote-stable`

Generates stable promotion changeset locally.

Main flags:

- `--dir <directory>`
- `--type <patch|minor|major>`
- `--summary <text>`
- `--dry-run`

## `ship task`

Task lifecycle entrypoint (v1 bootstrap).

Current implemented actions:

- `ship task new --type <feature|fix|chore|refactor|test> --title <text>`
- `ship task plan --id <taskId>`
- `ship task implement --id <taskId>`
- `ship task verify --id <taskId>`
- `ship task publish-ready --id <taskId>`
- `ship task status --id <taskId>`
- `ship task doctor`

Common flags:

- `--dir <directory>`
- `--json`
- `--dry-run`
- `--yes`

State files are managed under:

- `.agents/state/tasks/*.json`
- `.agents/state/ops.log`

## Agent-Focused Non-Interactive Usage

For automation agents and CI:

- always set `--yes` for mutating commands
- prefer `--dry-run` before real execution
- pass `--repo` explicitly to avoid repo inference issues
- pass `--check-timeout` and `--release-pr-timeout` explicitly in CI contexts

Safe sequence:

```bash
ship init --dir . --repo owner/repo --with-github --with-beta --with-npm --yes --dry-run
ship init --dir . --repo owner/repo --with-github --with-beta --with-npm --yes
ship release --repo owner/repo --yes --dry-run
ship release --repo owner/repo --yes
```

## `.ship.json` Configuration

Optional local config file at repository root:

```json
{
  "adapter": "npm",
  "adapterModule": "./ship-adapter.js",
  "baseBranch": "main",
  "betaBranch": "release/beta",
  "deploy": {
    "workflow": "release.yml"
  },
  "environment": "staging"
}
```

Current built-in adapters are `npm` and `firebase`.

External adapters can be loaded from local path via `adapterModule` and selected by name:

```json
{
  "adapter": "firebase",
  "adapterModule": "./ship-adapter.firebase.js"
}
```

`adapterModule` path is resolved relative to current working directory.

## Adapter Contract (v1)

Required for `open-pr` capability:

- `name: string`
- `capabilities.openPr: true`
- optional `normalizeArgs(args, { command })`
- optional `preparePrContext(context)` (return partial args override)

Required for `release` capability:

- `capabilities.release: true`
- `detectReleaseMode(context) -> "open-pr" | "publish"`
- `resolveReleaseContext(context) -> object`
- `findReleaseCandidates(context) -> ReleaseCandidate[]`
- `selectReleaseCandidate(context, candidates) -> ReleaseCandidate | null`
- `verifyPostMerge(context) -> { pass: boolean, diagnostics?: string[], targets?: [] }`

`ReleaseCandidate` supports:

- `{ type: "release_pr", releasePr: { number, url, headRefName, baseRefName } }`
- `{ type: "direct_publish", workflowRun: { databaseId, workflowName, status, conclusion, url } }`

## Node API

`ship` can also be used programmatically:

```js
const {
  run,
  loadShipConfig,
  resolveAdapter,
  runOpenPrCore,
  runReleaseCycleCore,
  runOpenPrFlow,
  runReleaseCycle,
  renderPrBodyDeterministic
} = require('@i-santos/ship/lib/run');
```

Main entry:

- `run(argv, dependencies?)`

Useful helpers:

- `loadShipConfig(cwd?)`
- `resolveAdapter(name, options?)`
- `runOpenPrCore(args, adapter, dependencies?, config?)`
- `runReleaseCycleCore(args, adapter, dependencies?, config?)`
- `renderPrBodyDeterministic(context, deps, options?)`
- `validateAdapterForCapability(adapter, capability)`

`dependencies` allows injection of custom executors for testing/mocking.

## Related Docs

- PR orchestration details: [pr-orchestration.md](./pr-orchestration.md)
- GitHub App auth mode: [release-auth-github-app.md](./release-auth-github-app.md)
