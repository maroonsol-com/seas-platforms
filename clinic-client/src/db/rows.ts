import type { SQL } from "drizzle-orm";

import type { TenantTransaction } from "./tenant-transaction";

export async function queryRows<T extends Record<string, unknown>>(
  tx: TenantTransaction,
  query: SQL,
): Promise<T[]> {
  const result = await tx.execute(query);
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] }).rows;
  return rows ?? [];
}

export async function queryValue(tx: TenantTransaction, query: SQL): Promise<string> {
  const rows = await queryRows<Record<string, unknown>>(tx, query);
  const row = rows[0];
  if (!row) throw new Error("Expected a database value.");
  const value = Object.values(row)[0];
  return String(value);
}
