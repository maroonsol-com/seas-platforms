import { Pool, neonConfig } from "@neondatabase/serverless";
import { runtimePoolMax } from "@saas/shared";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { readRuntimeDatabaseUrl } from "./env";
import { schema } from "./schema";

neonConfig.webSocketConstructor = ws;

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = readRuntimeDatabaseUrl();
    pool = new Pool({
      connectionString,
      max: runtimePoolMax(connectionString),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return pool;
}

export function getAdminDatabase() {
  return drizzle(getPool(), { schema });
}

export type AdminDatabase = ReturnType<typeof getAdminDatabase>;
export type AdminTransaction = Parameters<Parameters<AdminDatabase["transaction"]>[0]>[0];

/** Admin writes that must commit together. This never opens the Clinic database. */
export async function withAdminTransaction<T>(
  operation: (tx: AdminTransaction) => Promise<T>,
): Promise<T> {
  return getAdminDatabase().transaction(operation);
}

export async function closeAdminPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
