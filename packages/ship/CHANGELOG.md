# @i-santos/ship

## 1.0.0-beta.4

### Major Changes

- 271f131: Rename the ship orchestration command from `release-cycle` to `release` and update npmstack ship passthrough/docs/tests accordingly.

  Migration:

  - Replace `ship release-cycle ...` with `ship release ...`
  - Replace `npmstack ship release-cycle ...` with `npmstack ship release ...`

## 0.1.0-beta.3

### Minor Changes

- 8663f21: Expand the built-in npm adapter in `ship` to support full package workflows (`create`, `init`, `setup-github`, `setup-beta`, `setup-npm`, `promote-stable`) and make init autonomous by default for GitHub + npm setup (including first publish when package is missing).

  Also adds third-party adapter loading hooks via `.ship.json` (`adapterModule`) and runtime resolver injection.

- 8663f21: Unify beta provisioning into `ship setup-github` so GitHub baseline + beta branch/ruleset + local beta workflows/scripts are configured in a single command. Also expands `setup-github` flags with `--dir`, `--beta-branch`, `--release-auth`, `--force`, and `--yes`.

## 0.1.0-beta.0

### Minor Changes

- Initial beta release of `@i-santos/ship`.
- Includes npm adapter with create/init/setup flows and release orchestration commands.
