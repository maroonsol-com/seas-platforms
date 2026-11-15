import path from "node:path";
import { fileURLToPath } from "node:url";

import { executeCli } from "../../scripts/migration-runner.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = await executeCli({
  application: "clinic",
  appRoot,
  migrationsFolder: path.join(appRoot, "drizzle"),
  foreignMigrationsFolder: path.resolve(appRoot, "../admin/drizzle"),
  argv: process.argv.slice(2),
});
process.exit(code);
