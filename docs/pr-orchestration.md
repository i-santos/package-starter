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
3. enable auto-merge for code PR and wait merge
4. wait release PR (`changeset-release/*`)
5. checks
6. enable auto-merge for release PR and wait merge

Example:

```bash
create-package-starter release-cycle --yes
```

Stable promotion (protected `release/beta`):

```bash
create-package-starter release-cycle --promote-stable --promote-type minor --yes
```

Mode detection (`--mode auto`):

- branch starts with `changeset-release/` -> `publish`
- exactly one open `changeset-release/*` PR -> `publish`
- otherwise -> `open-pr`

Track behavior:

- branch != `release/beta` -> beta track only
- stable requires explicit `--promote-stable`

Merge strategy behavior:

- default: auto-merge for both code PR and release PR
- optional: `--confirm-merges` to ask confirmation before each merge step
- after checks are green, CLI verifies review/merge readiness:
  - if approvals are still required, it stops with actionable guidance
  - if ready and `--confirm-merges` is set, it asks confirmation (unless `--yes`)

Phase behavior:

- `--phase full` (default): code PR + release PR + npm validation + cleanup
- `--phase code`: stops after code PR merge into `release/beta`

Promotion flow (`--promote-stable`) on protected `release/beta`:

1. dispatch workflow `.github/workflows/promote-stable.yml`
2. workflow creates `promote/stable-*` branch
3. workflow opens PR `promote/stable-* -> release/beta` and enables auto-merge
4. release-cycle continues with `release/beta -> main` and release PR lifecycle

No direct push to protected `release/beta` is used.

Post-merge checks:

- release-cycle validates npm publish using `npm view`:
  - expected version
  - expected dist-tag (`beta` for beta track, `latest` for stable track)
- cleanup runs by default after success:
- cleanup only runs when npm validation passed
  - checkout base branch
  - pull latest
  - delete local feature branch
  - optional confirmation with `--confirm-cleanup`
  - disable with `--no-cleanup`

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

### NPM validation timeout/failure

If npm propagation is delayed, `release-cycle` can fail with validation diagnostics.
Re-run the command (publish path) after a short delay.

### Cleanup skipped

Cleanup is skipped when safety gates fail, such as:

- working tree not clean
- branch is protected (`main`, `release/beta`, `changeset-release/*`, `promote/*`)
- branch name does not match allowed code patterns (`feat/*`, `fix/*`, `chore/*`, etc.)
