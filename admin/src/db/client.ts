import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import "server-only";

import { readRuntimeDatabaseUrl } from "./env";
import { schema } from "./schema";

/**
 * Opens the Admin Neon database over HTTP. This uses DATABASE_URL. The HTTP
 * driver does not hold a Postgres session, so a pooled or direct Neon URL can
 * both serve these queries. This module never reads the Clinic database.
 */
export function createDatabase() {
  const sql = neon(readRuntimeDatabaseUrl());
  return drizzle(sql, { schema });
}

export type AdminDatabase = ReturnType<typeof createDatabase>;
