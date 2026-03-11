# Migration To `navy`

## Decision Summary

- Rename the current `ship` monorepo to `navy`.
- Move the current `admiral` repository into the monorepo as `packages/admiral`.
- Rename the current `agent` package to `workflow`.
- Keep `ship`, `admiral`, and `workflow` as separate packages inside the same monorepo.
- Treat `workflow` as a shared internal core library, not as the main product boundary.

## Naming Guidance

### `workflow` instead of `agent`

This is a better name than `agent` for the code that exists today.

Why:

- the current package is a deterministic task lifecycle engine
- it does not yet represent a real LLM provider runtime
- it models states and transitions, which is workflow semantics

Recommended package name:

- workspace folder: `packages/workflow`
- npm package: `@i-santos/workflow`

If later you build a real provider-facing execution package, that package can be named `agent`, `runner`, or something provider-specific.

### `navy` instead of `ship`

This also makes sense.

Why:

- `ship` becomes one product inside the ecosystem
- `admiral` and `ship` now live under the same domain language
- the monorepo stops pretending that `ship` is the whole system

Recommended result:

- repository name: `navy`
- packages:
  - `@i-santos/ship`
  - `@i-santos/admiral`
  - `@i-santos/workflow`

## Target Structure

```text
navy/
  package.json
  package-lock.json
  README.md
  CONTRIBUTING.md
  docs/
  packages/
    ship/
    admiral/
    workflow/
```

## Migration Strategy

Do this in stages. Do not mix repository move, package rename, and domain redesign in a single large commit if you can avoid it.

The safest order is:

1. Rename monorepo `ship` -> `navy`
2. Move `admiral` into `packages/admiral`
3. Make `admiral` build and test inside the monorepo
4. Rename `agent` -> `workflow`
5. Update `ship` imports and docs
6. Redesign integration boundaries between `ship` and `admiral`

## Phase 1: Rename Monorepo To `navy`

Goal: change the repository identity without changing package behavior yet.

### Steps

1. Rename the repository directory locally from `ship` to `navy`.
2. Update the root `package.json`:
   - change `"name": "ship-monorepo"` to `"name": "navy"` or `"navy-monorepo"`
   - update `"description"`
3. Update root `README.md` to describe the ecosystem instead of only `ship`.
4. Update references in docs that describe the repository as "ship monorepo".
5. Keep package names unchanged at this stage:
   - `@i-santos/ship`
   - `@i-santos/agent`

### Why this first

This separates repository naming from package behavior. It is low-risk and keeps the next steps easier to reason about.

## Phase 2: Move `admiral` Into The Monorepo

Goal: make `admiral` a third workspace package with minimal code changes.

### Target

Move:

```text
/home/igor/code/admiral
```

Into:

```text
/home/igor/code/navy/packages/admiral
```

### Steps

1. Copy or move the repository contents into `packages/admiral`.
2. Remove nested git metadata if present:
   - do not keep a nested `.git` directory inside `packages/admiral`
3. Review `packages/admiral/package.json`:
   - keep package name as `@i-santos/admiral`
   - verify `bin`, `files`, `scripts`, `repository.directory`
4. Update root workspace config if needed:
   - root already uses `"workspaces": ["packages/*"]`
   - this should automatically pick up `packages/admiral`
5. Run install from monorepo root so lockfile and workspace links are regenerated.
6. Run only `admiral` tests first.
7. Fix path assumptions that break because of the new package location.

### Things to verify in `admiral`

- README paths
- package repository metadata
- test paths
- any hard-coded assumptions about project root
- any relative file writes that assume repo root equals package root

## Phase 3: Make `admiral` A First-Class Workspace Package

Goal: ensure the monorepo can build, test, and release `admiral` cleanly.

### Steps

1. Update root scripts:
   - add `@i-santos/admiral` to root `test`
   - add `@i-santos/admiral` to root `check`
2. Decide whether `admiral` will be released through the same Changesets flow.
3. If yes:
   - ensure `packages/admiral/CHANGELOG.md` exists
   - ensure changesets include `@i-santos/admiral`
4. Update docs to present the workspace as a multi-package ecosystem.

### Recommended root scripts

Example:

```json
{
  "scripts": {
    "test": "npm run test -w @i-santos/ship && npm run test -w @i-santos/agent && npm run test -w @i-santos/admiral",
    "check": "npm run check -w @i-santos/ship && npm run check -w @i-santos/agent && npm run check -w @i-santos/admiral"
  }
}
```

Do not rename `agent` in the same step if you want cleaner diffs.

## Phase 4: Rename `agent` To `workflow`

Goal: align the package name with what it actually does.

### Current Reality

Today `agent` is not an execution runtime. It is a deterministic workflow/task-state engine.

### Rename Plan

1. Rename folder:

```text
packages/agent -> packages/workflow
```

2. Update package manifest:
   - `"name": "@i-santos/workflow"`
   - description and keywords
   - repository directory
3. Update imports in `ship`:
   - replace `@i-santos/agent` with `@i-santos/workflow`
4. Update references in docs, tests, and help text.
5. Update root scripts to point to `@i-santos/workflow`.
6. Decide compatibility policy:
   - either break cleanly now
   - or keep a temporary compatibility package for `@i-santos/agent`

### Recommendation

If this is still early and adoption is low, break cleanly now and rename directly.

If external users already consume `@i-santos/agent`, publish a compatibility package that re-exports `@i-santos/workflow` for one transition window.

## Phase 5: Redefine Package Boundaries

Goal: stop `ship` from owning orchestration concerns that belong to `admiral`.

### Recommended boundaries

`workflow`

- task states
- state transitions
- invariants
- shared task metadata contracts

`admiral`

- task graph
- scheduling
- parallel execution
- git worktree management
- recovery and retry
- merge/cleanup at task-execution level

`ship`

- repo bootstrap
- GitHub PR orchestration
- release PR orchestration
- checks monitoring
- npm publishing validation
- beta/stable promotion

### Important rule

Avoid making `admiral -> ship -> workflow` the core dependency chain.

Prefer:

- `ship -> workflow`
- `admiral -> workflow`

Optional integration between `ship` and `admiral` should happen through:

- shared library contracts
- shared state files
- explicit API adapters

Not through deep CLI chaining.

## Phase 6: Decide What Happens To `ship task`

Goal: avoid duplicated task systems.

### Current issue

`ship task` already manages `.agents/` state, while `admiral` has its own task graph/runtime model.

That overlap must be resolved.

### Recommendation

Short term:

- keep `ship task` as a compatibility layer
- document it as bootstrap/task-lifecycle support

Medium term:

- move orchestration ownership to `admiral`
- keep only release-facing task integration in `ship`

### Practical direction

Possible end state:

- `admiral task create`
- `admiral run`
- `admiral status`
- `ship open-pr --task-id ...`
- `ship release --task-id ...`

That keeps task execution in `admiral` and delivery/release in `ship`.

## Suggested Commit / PR Order

Recommended sequence:

1. `chore: rename ship monorepo to navy`
2. `chore: move admiral into navy workspace`
3. `chore: wire admiral into monorepo test and release flows`
4. `refactor: rename agent package to workflow`
5. `refactor: update ship to consume workflow package`
6. `design: align ship and admiral boundaries around workflow core`

If you want fewer PRs, combine 2 and 3. Do not combine all six.

## Immediate Next Step

Since you said you will start by moving the `admiral` folder into the `ship` repository, the practical next action is:

1. rename the repo directory to `navy` first, if you want the new identity now
2. move `admiral` into `packages/admiral`
3. make tests pass before renaming `agent`

That gives you a stable base before changing package names and internal contracts.
