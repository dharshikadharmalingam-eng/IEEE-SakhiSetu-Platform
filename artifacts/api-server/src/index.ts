import app from "./app";
import { assertAuthConfig } from "./lib/auth";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

assertAuthConfig();

const autoSeed = process.env["SEED_DEMO_DATA"] ? process.env["SEED_DEMO_DATA"] === "true" : process.env["NODE_ENV"] !== "production";
if (autoSeed) {
  await seedIfEmpty().catch((err) => logger.error({ err }, "Demo seeding failed"));
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
