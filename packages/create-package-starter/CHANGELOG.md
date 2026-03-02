# @i-santos/create-package-starter

## 1.5.0-beta.14

### Patch Changes

- 9f4034e: Fix `release-cycle` to handle successful direct publish runs (without opening a release PR) and avoid timeout waiting for a PR that will never be created. Also improves npm validation target resolution for this path by deriving package metadata from repository manifests/workspaces with optional `--npm-package` override.

## 1.5.0-beta.13

### Patch Changes

- 544eaa6: Fix `release-cycle` npm validation target resolution for monorepos/workspaces by deriving package names and versions from changed `package.json` files in the release PR. Also adds `--npm-package` override support for explicit package selection.

## 1.5.0-beta.12

### Patch Changes

- 9691d80: Improve `release-cycle` observability with periodic progress logs: while waiting for release PR creation it now reports release workflow status on `release/beta`, and while waiting npm propagation it reports observed `npm view version` and expected dist-tag values every 30 seconds.

## 1.5.0-beta.11

### Patch Changes

- 9689e04: Fix beta publish validation in release-cycle to use npm dist-tag as source of truth. Keep stable validation strict (version + latest tag).

## 1.5.0-beta.10

### Patch Changes

- 1fc50e8: Fix `release-cycle` release PR selection to respect the active release track. Beta flows now wait/merge only `changeset-release/* -> release/beta`, while stable flows target `main`, preventing wrong-track merges and npm validation mismatches.

## 1.5.0-beta.9

### Minor Changes

- 19c7035: Improve `release-cycle` with automatic resume and base-branch synchronization. Adds `--sync-base` (default `auto`) to rebase/merge feature branches when behind `release/beta`, and resume behavior (default on, disable with `--no-resume`) so reruns can continue release stages when code is already integrated.

### Patch Changes

- 4b02237: Refine `release-cycle` with safer auto mode detection, phased execution (`--phase code|full`), merge confirmations (`--confirm-merges`), and cleanup confirmation (`--confirm-cleanup`) gated by successful npm validation.
- 4b02237: Fix release-cycle to avoid explicit code PR merge when auto-merge is already enabled, preventing branch policy merge failures.

## 1.5.0-beta.8

### Minor Changes

- a8e3a70: Add Release-Cycle v1.1 with protected `release/beta` stable promotion via GitHub Actions, npm publish verification, and default safe local cleanup.

## 1.5.0-beta.7

### Minor Changes

- 488fb41: Add new `open-pr` and `release-cycle` commands to automate PR creation, checks watching, merge progression, and release PR handling for Changesets workflows.

  Include deterministic PR body generation, policy-aware merge behavior, and docs for orchestration usage/troubleshooting.

## 1.5.0-beta.6

### Minor Changes

- ed0ed07: Add release auth strategy support for generated and managed release workflows via `--release-auth` (`pat`, `app`, `github-token`, `manual-trigger`) across create/init/setup-beta.

  This allows teams to choose between PAT-based reliability, GitHub App tokens, built-in `GITHUB_TOKEN`, or explicit manual retrigger mode for release PR checks.

- a1af545: Improve release-auth setup DX with explicit interactive auth-mode selection, consolidated safety confirmations, app-secret preflight warnings, and clearer summary output sections.

  Add release-auth documentation updates, including an auth mode decision table and a new GitHub App setup guide.

### Patch Changes

- 9ac0d83: Improve `release-auth=app` guidance by supporting `GH_APP_CLIENT_ID` as fallback for `app-id` in generated release workflow, while keeping compatibility with `GH_APP_ID`.

## 1.5.0-beta.5

### Minor Changes

- 57bd295: Add an auto-retarget pull request workflow template that enforces default base routing (`release/beta -> main`, all other branches -> `release/beta`) and include it in create/init managed assets.

### Patch Changes

- e64018f: Refine `init` behavior to append template entries into existing `.gitignore`, keep `README.md` and `CONTRIBUTING.md` create-only, align PR template content, and run `npm install` at the end of initialization.
- b221367: Update release workflow template to use `CHANGESETS_GH_TOKEN` (fallback `GITHUB_TOKEN`) in `actions/checkout`, so release PR branch updates are performed with a token that correctly triggers downstream PR checks.

## 1.5.0-beta.4

### Patch Changes

- 4465427: Fix GitHub ruleset required status check context to use job name (`required-check`) instead of the full UI label, for both main and beta ruleset payloads.

## 1.5.0-beta.3

### Minor Changes

- b94b462: Add orchestrated `init` mode with optional integrated GitHub and npm setup (`--with-github`, `--with-beta`, `--with-npm`) including preflight validation, interactive confirmations, and step-by-step progress reporting.

  Also switch branch rulesets to require a stable CI context (`CI / required-check (pull_request)`) and update the CI template to expose a stable `required-check` job.

### Patch Changes

- b3188d2: Fix template gitignore packaging by storing it as `template/gitignore` and mapping it back to `.gitignore` during create/init.
- 889f282: Update release workflow template to install latest npm before `npm ci` and clear `NODE_AUTH_TOKEN` in the Changesets step to avoid OIDC publish conflicts.

## 1.5.0-beta.2

### Patch Changes

- 8eafbdf: Ensure CI workflow also runs on the beta branch (`release/beta`) so required status checks are enforced during prerelease flow.

## 1.5.0-beta.1

### Minor Changes

- 8e6aa78: Add beta release setup and stable promotion commands.

  - Add `setup-beta` to configure beta scripts and `release-beta.yml` workflow.
  - Add `promote-stable` to exit prerelease mode and generate explicit stable-promotion changeset.
  - Expand templates/init/create defaults with beta scripts and beta workflow scaffolding.
  - Update docs and tests for beta branch release flow (`release/beta` -> `main`).

## 1.4.1-beta.0

### Patch Changes

- c36a54d: Adjust `setup-npm` first publish flow to use standard interactive npm publish behavior.

  - Remove custom OTP flag handling.
  - Delegate first publish directly to `npm publish --access public` with inherited stdio.
  - Improve EOTP error guidance while keeping npm native interactive flow.

## 1.4.0

### Minor Changes

- 36924f3: Add `setup-npm` command to bootstrap npm first-publish readiness.

  - Validate npm CLI availability and authentication.
  - Check whether package exists on npm.
  - Support optional first publish execution with `--publish-first`.
  - Support `--dry-run` to preview first publish without mutating.
  - Print Trusted Publisher manual next steps after setup.

## 1.3.0

### Minor Changes

- 7609cc4: Improve `setup-github` defaults to better support release automation.

  - Configure GitHub Actions workflow permissions to `write` at repository level.
  - Enable workflow ability to approve pull request reviews.
  - Change default branch ruleset approval requirement from 1 reviewer to 0.

## 1.2.0

### Minor Changes

- 6179480: Expand package-starter to be the single source of truth for npm package DX.

  - Extend `create` and `init` to manage standardized release/CI/docs repository baselines.
  - Add `setup-github` command to apply repository defaults and branch ruleset via `gh`.
  - Add deterministic command summaries and broader test coverage for create/init/setup-github/template snapshots.
  - Update docs with migration guidance and npm Trusted Publishing flow.

## 1.1.0

### Minor Changes

- db7ad4d: Add `init` mode to bootstrap existing npm projects with standardized Changesets scripts and release workflow files.

## 1.0.0

### Major Changes

- 82d99b1: Remove `release-cli` integration and generate packages with a Changesets-only release workflow.

  Breaking changes:

  - Removed CLI options `--release-cli-pkg` and `--release-cli-version`.
  - Generated package scripts now include only `check`, `changeset`, `version-packages`, and `release`.
  - Removed legacy `release:beta`, `release:stable`, `release:publish`, and `registry:start` scripts from generated output.

## 0.1.2

### Patch Changes

- fe9d06d: Fix release workflow authentication for npm trusted publishing and sync the working setup across package templates and setup-generated workflows.

## 0.1.1

### Patch Changes

- 94b8a7e: Polish package metadata, docs, and CI/release setup with Changesets.
