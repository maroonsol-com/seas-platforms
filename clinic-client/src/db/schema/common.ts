import { sql } from "drizzle-orm";
import { type AnyPgColumn, foreignKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgPolicy } from "drizzle-orm/pg-core";

export function idColumn() {
  return uuid("id").primaryKey().defaultRandom();
}

export function createdAtColumn() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

export function updatedAtColumn() {
  return timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
}

export function sameBusinessForeignKey(
  name: string,
  columns: [AnyPgColumn, AnyPgColumn],
  foreignColumns: [AnyPgColumn, AnyPgColumn],
) {
  return foreignKey({ name, columns, foreignColumns }).onDelete("restrict");
}

/** Tenant policy. A missing or different business setting hides the row. */
export function businessIsolationPolicy(tableName: string, businessId: AnyPgColumn) {
  return pgPolicy(`${tableName}_business_isolation`, {
    for: "all",
    using: sql`${businessId} = nullif(current_setting('app.current_business_id', true), '')::uuid`,
    withCheck: sql`${businessId} = nullif(current_setting('app.current_business_id', true), '')::uuid`,
  });
}
