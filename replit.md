# SakhiSetu

SakhiSetu helps women move from existing skills to suitable income opportunities through targeted learning, verification, and explainable matching.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/sakhisetu/src/App.tsx` — responsive marketing site, woman dashboard, readiness profile, learning, opportunities, applications, and onboarding routes
- `artifacts/sakhisetu/src/index.css` — Marigold & Ink visual language and responsive tokens
- `artifacts/api-server/src/routes/sakhisetu.ts` — demo API data, matching explanations, course progress, and application mutations
- `lib/api-spec/openapi.yaml` — source of truth for typed SakhiSetu endpoints
- `lib/api-client-react/src/generated/` — generated React Query client and schemas

## Architecture decisions

- The matching experience is explainable and rule-based; the UI shows the match reasons, skill gaps, and configurable score components.
- The first demo is intentionally centered on Anitha's practical-income pathway, while the learning catalog includes technology pathways for future role-based demos.
- SakhiSetu readiness is described as an indicative measure, not a scientific score, certification, or guarantee of work or safety.
- The initial API keeps demo state in a small server-side store so the end-to-end hackathon journey works without requiring setup steps before preview.

## Product

- Landing page explains the existing-skills → skill-gap → learning → verification → opportunity journey.
- Woman users can view and edit their readiness profile, add skills, browse learning modules, track course progress, submit an assessment, view certificates as learning records, inspect matched opportunities, understand the match logic, apply, and track applications.
- Employers and admin routes are reserved in the product model for the next backend expansion.

## User preferences

None recorded.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- Vite production builds require workflow-provided `PORT` and `BASE_PATH`; the managed web workflow supplies them automatically.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
