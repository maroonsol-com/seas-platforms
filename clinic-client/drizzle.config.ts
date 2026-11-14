import { defineConfig } from "drizzle-kit";

import { resolveDrizzleKitUrl } from "./src/db/env";

/**
 * Clinic database only.
 *
 * Run from clinic-client/, or with `pnpm --filter @saas/clinic-client db:generate`.
 * The wrapper script loads clinic-client/.env and lets those values override the
 * shell, so an Admin DATABASE_URL exported in the terminal cannot be used here.
 * Migrations use DATABASE_URL_UNPOOLED (direct Neon connection).
 */
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDrizzleKitUrl(),
  },
  strict: true,
  verbose: true,
});
