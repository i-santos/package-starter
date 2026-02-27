# @i-santos/create-package-starter

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
