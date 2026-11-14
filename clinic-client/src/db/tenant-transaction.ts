import { Pool, neonConfig } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { readRuntimeDatabaseUrl, readRuntimePoolMax } from "./env";
import { schema } from "./schema";

neonConfig.webSocketConstructor = ws;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return value;
}

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: readRuntimeDatabaseUrl(),
      max: readRuntimePoolMax(),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

function createTenantDatabase() {
  return drizzle(getPool(), { schema });
}

type TenantDatabase = ReturnType<typeof createTenantDatabase>;
export type TenantTransaction = Parameters<Parameters<TenantDatabase["transaction"]>[0]>[0];

/**
 * Runs Clinic queries inside one transaction with a transaction-local tenant
 * setting. Neon HTTP cannot hold SET LOCAL across statements, so tenant tables
 * must use this WebSocket transaction. The setting is cleared when the
 * transaction ends and is not left on the pooled connection.
 *
 * The Neon owner role bypasses row level security. This helper switches to
 * clinic_app for the transaction, so the policies apply. The role change is
 * local to the transaction and is not left on the pooled connection.
 */
export async function withTenantTransaction<T>(
  businessId: string,
  operation: (tx: TenantTransaction) => Promise<T>,
  userId?: string,
): Promise<T> {
  const business = assertUuid(businessId, "Business id");
  const user = userId === undefined ? undefined : assertUuid(userId, "User id");
  const database = createTenantDatabase();

  return database.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_business_id', ${business}, true)`);
    if (user) {
      await tx.execute(sql`select set_config('app.current_user_id', ${user}, true)`);
    }
    await tx.execute(sql`set local role clinic_app`);
    return operation(tx);
  });
}

/** Lists the signed-in user's businesses before one business is selected. */
export async function withUserTransaction<T>(
  userId: string,
  operation: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const user = assertUuid(userId, "User id");
  const database = createTenantDatabase();

  return database.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${user}, true)`);
    await tx.execute(sql`set local role clinic_app`);
    return operation(tx);
  });
}

/**
 * Runs one privileged service function as clinic_app. The function itself is
 * SECURITY DEFINER and is the only place a new business is created before a
 * tenant id is known. Ordinary tenant queries must use withTenantTransaction.
 */
export async function withServiceRoleTransaction<T>(
  operation: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const database = createTenantDatabase();
  return database.transaction(async (tx) => {
    await tx.execute(sql`set local role clinic_app`);
    return operation(tx);
  });
}

export async function closeTenantPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
