# PR Orchestration (`open-pr` and `release-cycle`)

This guide explains how to automate pull request creation and release progression with:

- `create-package-starter open-pr`
- `create-package-starter release-cycle`

## Goals

- Avoid repetitive manual PR operations in GitHub UI.
- Keep a solo-founder flow fast.
- Stay safe for team repositories with required checks/reviews.

## `open-pr`

Use `open-pr` to push and create/update a PR in one command.

Example:

```bash
create-package-starter open-pr --auto-merge --watch-checks
```

Default branch mapping:

- if current branch is `release/beta` -> base is `main`
- otherwise -> base is `release/beta`

Body source priority:

1. `--body`
2. `--body-file`
3. `--template` (or `.github/PULL_REQUEST_TEMPLATE.md`)
4. deterministic generated markdown (summary/changes/release impact/checklist)

## `release-cycle`

Use `release-cycle` to orchestrate full progression:

1. code PR open/update
2. checks
3. merge code PR
4. wait release PR (`changeset-release/*`)
5. checks
6. merge release PR

Example:

```bash
create-package-starter release-cycle --yes
```

Mode detection (`--mode auto`):

- branch starts with `changeset-release/` -> `publish`
- exactly one open `changeset-release/*` PR -> `publish`
- otherwise -> `open-pr`

## Team-safe behavior

The flow is policy-aware:

- does not bypass required checks
- does not bypass required approvals
- returns non-zero with actionable message when blocked

## Troubleshooting

### Checks pending forever

- Verify required check names in ruleset exactly match workflow job names.
- If using `manual-trigger` release auth mode, push an empty commit to retrigger checks on `changeset-release/*`.

### Ambiguous release PR

If multiple `changeset-release/*` PRs are open, `release-cycle` fails intentionally.  
Close outdated PRs or run with explicit selection:

```bash
create-package-starter release-cycle --mode publish --head changeset-release/release/beta
```

### Merge blocked by policy

`release-cycle` reports why merge was blocked.  
Typical causes:

- missing approvals
- required status checks pending/failing
- branch protection constraints

Fix policy blockers and rerun command.
