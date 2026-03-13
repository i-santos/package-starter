# navy

Monorepo for the navy product-development ecosystem.

## Packages

- `@i-santos/ship`: delivery CLI for repository bootstrap, PR orchestration, release flows, and publishing automation.
- `@i-santos/admiral`: task-orchestration CLI for multi-agent execution, scheduling, and project runtime management.
- `@i-santos/workflow`: deterministic workflow core for task lifecycle states and shared task metadata contracts.

## Official Flow

`admiral` owns task orchestration and runtime state. `ship` owns delivery and release progression.

```bash
admiral init
admiral task create backend-auth --scope backend
admiral task plan backend-auth
admiral task tdd backend-auth
admiral task implement backend-auth
admiral task verify backend-auth
admiral task publish-ready backend-auth
admiral run --once
ship release --phase code --task-id backend-auth --yes
ship release --task-id backend-auth --yes
```

## Workspace Commands

```bash
npm run test
npm run check
npm run changeset
npm run release
```

## Documentation

- [ship README](./packages/ship/README.md)
- [admiral README](./packages/admiral/README.md)
- [workflow README](./packages/workflow/README.md)
- [ship API](./docs/ship-api.md)
