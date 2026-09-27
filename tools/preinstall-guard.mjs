// Cross-platform (Windows/macOS/Linux) equivalent of the old `sh -c '...'` preinstall
// script. Ensures pnpm is the package manager in use and removes stray lockfiles from
// other package managers so they don't drift out of sync with pnpm-lock.yaml.
import { existsSync, rmSync } from "node:fs";

for (const lockfile of ["package-lock.json", "yarn.lock"]) {
  if (existsSync(lockfile)) rmSync(lockfile, { force: true });
}

const userAgent = process.env.npm_config_user_agent ?? "";
if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead (see README.md / SETUP_README.md). Run: pnpm install");
  process.exit(1);
}
