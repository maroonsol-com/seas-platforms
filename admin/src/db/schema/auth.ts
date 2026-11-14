import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { platformAdministrators } from "./administrators";
import { createdAtColumn, idColumn } from "./common";

/** Hashed one-time codes. The raw code is never stored. */
export const administratorOtpChallenges = pgTable("administrator_otp_challenges", {
  id: idColumn(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAtColumn(),
}, (table) => [
  index("administrator_otp_challenges_email_idx").on(table.email, table.createdAt),
]);

export const administratorSessions = pgTable("administrator_sessions", {
  id: idColumn(),
  administratorId: uuid("administrator_id").notNull().references(() => platformAdministrators.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("administrator_sessions_token_hash_unique").on(table.tokenHash),
  index("administrator_sessions_administrator_idx").on(table.administratorId),
]);
