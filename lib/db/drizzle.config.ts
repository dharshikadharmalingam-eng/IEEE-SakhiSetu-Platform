import { defineConfig } from "drizzle-kit";
import path from "path";

// drizzle-kit's own dotenv lookup only checks the current working directory, so when this
// command is invoked as `pnpm --filter @workspace/db run push` from the repo root (cwd stays
// at lib/db), a root-level .env file (as documented in SETUP_README.md) would otherwise be
// missed. Load it explicitly here, without adding a new dependency, using Node's built-in
// process.loadEnvFile (Node 20.12+/22). It never overrides variables already set in the
// environment (e.g. by a process manager, CI, or Replit secrets).
const rootEnvFile = path.resolve(__dirname, "../../.env");
try {
  process.loadEnvFile(rootEnvFile);
} catch {
  // No root .env file present (e.g. env vars supplied another way) — nothing to do.
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
