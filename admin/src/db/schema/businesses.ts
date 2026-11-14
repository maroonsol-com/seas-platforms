import { sql } from "drizzle-orm";
import { boolean, char, check, date, index, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { platformAdministrators } from "./administrators";
import { createdAtColumn, idColumn, updatedAtColumn } from "./common";
import {
  billingCycleEnum,
  manualPaymentMethodEnum,
  manualPaymentStatusEnum,
  planStatusEnum,
  platformBusinessStatusEnum,
  subscriptionEventTypeEnum,
  subscriptionStatusEnum,
} from "./enums";
import { saasProducts } from "./products";

export const businesses = pgTable("businesses", {
  id: idColumn(),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  businessType: text("business_type").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ownerMobile: text("owner_mobile").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("IN"),
  gstin: text("gstin"),
  status: platformBusinessStatusEnum("status").notNull().default("provisioning_pending"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  internalNotes: text("internal_notes"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  index("businesses_status_idx").on(table.status),
  index("businesses_owner_email_idx").on(table.ownerEmail),
  check("businesses_gstin_length", sql`${table.gstin} IS NULL OR char_length(${table.gstin}) = 15`),
]);

/**
 * One business belongs to one SaaS product. The product database is chosen
 * from this row and is not shared with another product.
 */
export const businessProducts = pgTable("business_products", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  productId: uuid("product_id").notNull().references(() => saasProducts.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("business_products_business_unique").on(table.businessId),
  index("business_products_product_idx").on(table.productId),
]);

export const subscriptionPlans = pgTable("subscription_plans", {
  id: idColumn(),
  productId: uuid("product_id").notNull().references(() => saasProducts.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  billingCycle: billingCycleEnum("billing_cycle").notNull(),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  trialDays: integer("trial_days").notNull().default(0),
  graceDays: integer("grace_days").notNull().default(0),
  maxUsers: integer("max_users"),
  maxBranches: integer("max_branches"),
  storageLimitMb: integer("storage_limit_mb"),
  status: planStatusEnum("status").notNull().default("active"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("subscription_plans_product_name_unique").on(table.productId, table.name),
  index("subscription_plans_product_idx").on(table.productId),
  check("subscription_plans_price_nonnegative", sql`${table.price} >= 0`),
  check("subscription_plans_trial_nonnegative", sql`${table.trialDays} >= 0`),
  check("subscription_plans_grace_nonnegative", sql`${table.graceDays} >= 0`),
  check("subscription_plans_limits_nonnegative", sql`
    (${table.maxUsers} IS NULL OR ${table.maxUsers} >= 0)
    AND (${table.maxBranches} IS NULL OR ${table.maxBranches} >= 0)
    AND (${table.storageLimitMb} IS NULL OR ${table.storageLimitMb} >= 0)
  `),
]);

export const planFeatures = pgTable("plan_features", {
  id: idColumn(),
  planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "restrict" }),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  limitValue: integer("limit_value"),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("plan_features_plan_key_unique").on(table.planId, table.featureKey),
]);

export const businessSubscriptions = pgTable("business_subscriptions", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  planId: uuid("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "restrict" }),
  status: subscriptionStatusEnum("status").notNull(),
  startsOn: date("starts_on").notNull(),
  expiresOn: date("expires_on").notNull(),
  timezone: text("timezone").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  index("business_subscriptions_business_idx").on(table.businessId),
  index("business_subscriptions_expiry_idx").on(table.expiresOn),
  index("business_subscriptions_status_idx").on(table.status),
  uniqueIndex("business_subscriptions_one_open").on(table.businessId).where(
    sql`${table.status} IN ('trial', 'active', 'expiring_soon', 'suspended')`,
  ),
  check("business_subscriptions_dates", sql`${table.expiresOn} >= ${table.startsOn}`),
]);

export const subscriptionEvents = pgTable("subscription_events", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => businessSubscriptions.id, { onDelete: "restrict" }),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  eventType: subscriptionEventTypeEnum("event_type").notNull(),
  fromStatus: subscriptionStatusEnum("from_status"),
  toStatus: subscriptionStatusEnum("to_status").notNull(),
  fromPlanId: uuid("from_plan_id").references(() => subscriptionPlans.id, { onDelete: "restrict" }),
  toPlanId: uuid("to_plan_id").references(() => subscriptionPlans.id, { onDelete: "restrict" }),
  previousExpiresOn: date("previous_expires_on"),
  newExpiresOn: date("new_expires_on"),
  actorAdministratorId: uuid("actor_administrator_id").references(() => platformAdministrators.id, { onDelete: "restrict" }),
  note: text("note"),
  createdAt: createdAtColumn(),
}, (table) => [
  index("subscription_events_subscription_idx").on(table.subscriptionId),
  index("subscription_events_business_idx").on(table.businessId),
]);

export const manualPayments = pgTable("manual_payments", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").references(() => businessSubscriptions.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  paymentDate: date("payment_date").notNull(),
  method: manualPaymentMethodEnum("method").notNull(),
  transactionReference: text("transaction_reference"),
  remarks: text("remarks"),
  status: manualPaymentStatusEnum("status").notNull().default("recorded"),
  idempotencyKey: text("idempotency_key").notNull(),
  recordedBy: uuid("recorded_by").references(() => platformAdministrators.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("manual_payments_idempotency_unique").on(table.idempotencyKey),
  index("manual_payments_business_idx").on(table.businessId),
  index("manual_payments_subscription_idx").on(table.subscriptionId),
  check("manual_payments_amount_positive", sql`${table.amount} > 0`),
]);
