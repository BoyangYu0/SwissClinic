# Swiss Clinical Placement Index

Open-source, TypeScript-first tooling for collecting, validating, and publishing Swiss clinical placement information from transparent public sources.

## Getting Started

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

The repository is currently at the monorepo bootstrap stage. Source registry, parser, crawler, and frontend functionality are intentionally left for later plan steps.

## Workspace Layout

- `apps/web`: static frontend application placeholder
- `apps/worker`: future crawler and data builder commands
- `packages/schema`: shared Zod schemas and TypeScript types
- `packages/sources`: future source registry loading package
- `packages/utils`: future shared utilities
- `packages/parsers`: future parser framework
- `data`: generated datasets, snapshots, and exports
- `docs`: project documentation

