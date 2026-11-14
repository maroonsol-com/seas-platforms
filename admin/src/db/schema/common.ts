import { timestamp, uuid } from "drizzle-orm/pg-core";

export function idColumn() {
  return uuid("id").primaryKey().defaultRandom();
}

export function createdAtColumn() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

export function updatedAtColumn() {
  return timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
}
