# navy

Monorepo for the navy product-development ecosystem.

## Packages

- `@i-santos/ship`: delivery CLI for repository bootstrap, PR orchestration, release flows, and publishing automation.
- `@i-santos/admiral`: task-orchestration CLI for multi-agent execution, scheduling, and project runtime management.
- `@i-santos/workflow`: deterministic workflow core for task lifecycle states and shared task metadata contracts.

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
