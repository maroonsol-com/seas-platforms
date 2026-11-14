import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, date } from "drizzle-orm/pg-core";

import { platformAdministrators } from "./administrators";
import { businesses, subscriptionPlans } from "./businesses";
import { createdAtColumn, idColumn, updatedAtColumn } from "./common";
import { provisioningStatusEnum } from "./enums";
import { saasProducts } from "./products";

export const invitations = pgTable("invitations", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  productId: uuid("product_id").notNull().references(() => saasProducts.id, { onDelete: "restrict" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
  index("invitations_business_idx").on(table.businessId),
  index("invitations_email_idx").on(table.email),
]);

/**
 * Cross-database provisioning state. `productBusinessId` is the id created
 * inside the product database. It is not a foreign key into that database.
 */
export const businessProvisioning = pgTable("business_provisioning", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  productId: uuid("product_id").notNull().references(() => saasProducts.id, { onDelete: "restrict" }),
  idempotencyKey: text("idempotency_key").notNull(),
  status: provisioningStatusEnum("status").notNull().default("pending"),
  productBusinessId: uuid("product_business_id"),
  requestedPlanId: uuid("requested_plan_id").references(() => subscriptionPlans.id, { onDelete: "restrict" }),
  requestedStartsOn: date("requested_starts_on"),
  requestedExpiresOn: date("requested_expires_on"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
  succeededAt: timestamp("succeeded_at", { withTimezone: true }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("business_provisioning_business_unique").on(table.businessId),
  uniqueIndex("business_provisioning_idempotency_unique").on(table.idempotencyKey),
  index("business_provisioning_status_idx").on(table.status),
]);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAtColumn(),
});

export const platformAuditLogs = pgTable("platform_audit_logs", {
  id: idColumn(),
  actorAdministratorId: uuid("actor_administrator_id").references(() => platformAdministrators.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "restrict" }),
  productId: uuid("product_id").references(() => saasProducts.id, { onDelete: "restrict" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text("ip_address"),
  createdAt: createdAtColumn(),
}, (table) => [
  index("platform_audit_logs_created_idx").on(table.createdAt),
  index("platform_audit_logs_entity_idx").on(table.entityType, table.entityId),
  index("platform_audit_logs_actor_idx").on(table.actorAdministratorId),
]);

export const administrativeActivityLogs = pgTable("administrative_activity_logs", {
  id: idColumn(),
  actorAdministratorId: uuid("actor_administrator_id").references(() => platformAdministrators.id, { onDelete: "restrict" }),
  summary: text("summary").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  createdAt: createdAtColumn(),
}, (table) => [
  index("administrative_activity_logs_created_idx").on(table.createdAt),
]);
