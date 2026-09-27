# SakhiSetu

SakhiSetu is a full-stack employment-readiness application for helping women understand their strengths, build verified skills, follow focused learning paths, and explore explainably matched opportunities.

## Included

- `artifacts/sakhisetu`: React + Vite frontend
- `artifacts/api-server`: Express API server
- `lib/api-spec`: OpenAPI source of truth
- `lib/api-client-react` and `lib/api-zod`: generated API clients, hooks, and schemas
- `lib/db`: Drizzle PostgreSQL schema and database client
- `scripts`: workspace scripts
- Root workspace configuration, package manifests, and the pnpm lockfile

The current version includes the explainable Sakhi Score flow, score history persistence, score recommendations, profile/skill/learning integrations, and the existing opportunities and applications journey.

## Development

1. Install dependencies with `pnpm install`.
2. Provision PostgreSQL and set the variables shown in `.env.example`.
3. Apply the development schema with `pnpm --filter @workspace/db run push`.
4. Run the configured Replit workflows, or use the package scripts with `PORT` and `BASE_PATH` set.
5. Run `pnpm run typecheck` to check the workspace.

Do not commit real secrets. Copy `.env.example` to a local environment file and fill in values only in the local environment or Replit Secrets.
