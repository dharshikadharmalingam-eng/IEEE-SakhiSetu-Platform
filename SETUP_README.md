# SakhiSetu — Local Setup

**Bridging Women's Existing Skills to Real Income Opportunities**

This is the complete SakhiSetu full-stack project: frontend (React/Vite), backend
(Express/TypeScript), PostgreSQL + Drizzle ORM, an OpenAPI spec with a generated
Zod + React Query client, all in a pnpm workspace.

## Windows compatibility

This project runs on Windows, macOS, and Linux. Two things that used to rely on
Unix-only shell syntax were made cross-platform:
- The root `preinstall` script now runs a small Node.js script
  (`tools/preinstall-guard.mjs`) instead of `sh -c '...'`.
- The API server's `dev` script no longer uses bash's `export VAR=...`.
- `.env` is loaded automatically by both `drizzle-kit` and the API server
  (via Node's built-in `--env-file-if-exists` flag and `process.loadEnvFile`)
  regardless of which directory a command is run from — no manual exporting
  of environment variables is required on any platform.

## 1. Required software

- **Node.js** 20 or later
- **pnpm** 9 or later (`npm install -g pnpm`)
- **PostgreSQL** 14 or later, running locally or reachable over the network

## 2. Installation

From the project root:

```bash
pnpm install
```

This installs dependencies for every workspace package (`artifacts/sakhisetu`,
`artifacts/api-server`, `lib/db`, `lib/api-spec`, `lib/api-zod`,
`lib/api-client-react`, `scripts`).

## 3. Environment setup

Copy the example environment file and fill in real values:

```bash
cp .env.example .env
```

At minimum, set `DATABASE_URL` to point at a PostgreSQL database you control, and
set `SESSION_SECRET` to a long random string. See the comments in `.env.example`
for every variable the app reads (admin account creation, demo mode, optional AI
feedback, CORS, etc.).

## 4. Database setup

Push the Drizzle schema (defined in `lib/db/src/schema/*.ts`) to your database:

```bash
pnpm --filter @workspace/db run push
```

This uses `lib/db/drizzle.config.ts` and your `DATABASE_URL` to create every
table (users, sessions, women_profiles, employers, employer_verifications,
skills, user_skills, courses, course_lessons, assessment_questions,
course_enrollments, course_progress, skill_assessments, certificates,
opportunities, opportunity_skills, applications, application_events, feedback,
notifications, reports, sakhi_score_history).

## 5. Seed demo data

Build the API server first (the seed script runs from the compiled output):

```bash
pnpm --filter @workspace/api-server run build
```

Then run the seed script:

```bash
pnpm --filter @workspace/api-server run seed
```

This only seeds if the database is empty. To wipe and reseed at any time:

```bash
SEED_RESET=true pnpm --filter @workspace/api-server run seed
```

Seeding creates two demo learners (Anitha, Priya), five demo employers, eight
opportunities, seven courses with real lessons/questions, and (when
`DEMO_MODE=true`, or when `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set) an admin
account. All demo accounts use the password in `DEMO_PASSWORD`
(`SakhiDemo2026` by default) — see the server logs after seeding for the list
of demo emails, or query `GET /api/auth/demo` while `DEMO_MODE=true`.

> Note: with `DEMO_MODE=true` (the default in `.env.example`), the API server
> also auto-seeds an empty database itself on first boot — step 5 is then
> optional, but running it manually (or with `SEED_RESET=true`) still works.

## 6. Development

Start the backend API (defaults to port 5000, see `PORT` in `.env`):

```bash
pnpm --filter @workspace/api-server run dev
```

In a separate terminal, start the frontend:

```bash
pnpm --filter @workspace/sakhisetu run dev
```

The Vite dev server proxies API requests to the backend. Open the printed
local URL and sign in with a seeded demo account, or register a new one.

### Other useful commands

```bash
pnpm run typecheck              # typecheck every workspace package
pnpm run build                  # typecheck + build every package
pnpm --filter @workspace/api-server run test:e2e   # end-to-end API test suite
                                                     # (run against a live, seeded server)
```

> On Windows, run these same commands from PowerShell or cmd.exe — no shell
> translation layer (WSL/Git Bash) is required.

## Project structure

```
artifacts/
  sakhisetu/       React + TypeScript + Vite + Tailwind frontend
  api-server/      Express + TypeScript backend (auth, matching, Sakhi Score, etc.)
lib/
  db/              Drizzle schema + client
  api-spec/        OpenAPI specification (source of truth) + codegen config
  api-zod/         Generated Zod schemas from the OpenAPI spec
  api-client-react/  Generated React Query hooks from the OpenAPI spec
scripts/           Workspace-level scripts
```

## Notes

- Opportunity matching is transparent, rule-based, and fully explainable
  (`artifacts/api-server/src/lib/matching.ts`) — never a black box. Weights:
  skill match 50%, availability 20%, work preference (including whether the
  role's location or remote/local nature fits you) 15%, experience 10%,
  your own feedback track record from completed work 5%.
- The Sakhi Score is an indicative readiness indicator, not a guarantee of
  employment or income (`artifacts/api-server/src/lib/sakhi-score.ts`).
- "AI-assisted learning feedback" is optional and only activates if
  `ANTHROPIC_API_KEY` is set; it is safely disabled otherwise and never
  affects matching or scoring.
- No real secrets are included anywhere in this archive — only
  `.env.example` with placeholder values.
