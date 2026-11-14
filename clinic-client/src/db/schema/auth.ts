import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAtColumn, idColumn } from "./common";
import { users } from "./tenancy";

/**
 * Hashed one-time codes for clinic users. These rows are looked up before a
 * business is selected, so they stay outside row level security, like users.
 */
export const userOtpChallenges = pgTable("user_otp_challenges", {
  id: idColumn(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAtColumn(),
}, (table) => [
  index("user_otp_challenges_email_idx").on(table.email, table.createdAt),
]);

/** The active business is stored on the session after membership is checked. */
export const userSessions = pgTable("user_sessions", {
  id: idColumn(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull(),
  businessId: uuid("business_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("user_sessions_token_hash_unique").on(table.tokenHash),
  index("user_sessions_user_idx").on(table.userId),
]);
