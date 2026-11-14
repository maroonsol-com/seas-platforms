import { defineConfig } from "drizzle-kit";

import { resolveDrizzleKitUrl } from "./src/db/env";

/**
 * Admin database only.
 *
 * Run from admin/, or with `pnpm --filter @saas/admin db:generate`.
 * The wrapper script loads admin/.env and lets those values override the
 * shell, so a Clinic DATABASE_URL exported in the terminal cannot be used here.
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
