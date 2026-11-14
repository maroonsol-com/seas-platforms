import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import "server-only";

import { readRuntimeDatabaseUrl } from "./env";
import { schema } from "./schema";

/**
 * Opens the Clinic Neon database over HTTP. This uses DATABASE_URL, which may
 * be the Neon pooler. HTTP queries do not hold a Postgres session. Tenant
 * queries that need row level security must use the WebSocket transaction
 * helper instead, because HTTP cannot carry a transaction-local setting.
 */
export function createDatabase() {
  const sql = neon(readRuntimeDatabaseUrl());
  return drizzle(sql, { schema });
}

export type ClinicDatabase = ReturnType<typeof createDatabase>;
