import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { seedDemo, seedIfEmpty } from "./seed";

const reset = process.env["SEED_RESET"] === "true";
try {
  if (reset) await seedDemo({ reset: true });
  else if (!(await seedIfEmpty())) logger.info("Database already has data; nothing seeded. Set SEED_RESET=true to wipe and reseed.");
} finally {
  await pool.end();
}
