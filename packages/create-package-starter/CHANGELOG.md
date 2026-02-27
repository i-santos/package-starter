# @i-santos/create-package-starter

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
