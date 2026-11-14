import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  integer,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  businessIsolationPolicy,
  createdAtColumn,
  idColumn,
  sameBusinessForeignKey,
  updatedAtColumn,
} from "./common";
import { collectionMethodEnum, fileStatusEnum } from "./enums";
import { branches, businesses, users } from "./tenancy";

export const expenseCategories = pgTable("expense_categories", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("expense_categories_business_name_unique").on(table.businessId, table.name),
  unique("expense_categories_id_business_unique").on(table.id, table.businessId),
  businessIsolationPolicy("expense_categories", table.businessId),
]).enableRLS();

export const expenses = pgTable("expenses", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id"),
  categoryId: uuid("category_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  method: collectionMethodEnum("method").notNull(),
  expenseDate: date("expense_date").notNull(),
  notes: text("notes"),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  index("expenses_business_date_idx").on(table.businessId, table.expenseDate),
  index("expenses_category_idx").on(table.categoryId),
  sameBusinessForeignKey(
    "expenses_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  sameBusinessForeignKey(
    "expenses_category_business_fk",
    [table.categoryId, table.businessId],
    [expenseCategories.id, expenseCategories.businessId],
  ),
  check("expenses_amount_nonnegative", sql`${table.amount} >= 0`),
  businessIsolationPolicy("expenses", table.businessId),
]).enableRLS();

export const fileMetadata = pgTable("file_metadata", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id"),
  productKey: text("product_key").notNull().default("clinic"),
  originalFilename: text("original_filename").notNull(),
  storageName: text("storage_name").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  storageKey: text("storage_key").notNull(),
  relatedType: text("related_type"),
  relatedId: uuid("related_id"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "restrict" }),
  status: fileStatusEnum("status").notNull().default("active"),
  createdAt: createdAtColumn(),
}, (table) => [
  uniqueIndex("file_metadata_storage_key_unique").on(table.storageKey),
  unique("file_metadata_id_business_unique").on(table.id, table.businessId),
  index("file_metadata_business_idx").on(table.businessId),
  index("file_metadata_related_idx").on(table.businessId, table.relatedType, table.relatedId),
  sameBusinessForeignKey(
    "file_metadata_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  check("file_metadata_byte_size_nonnegative", sql`${table.byteSize} >= 0`),
  check("file_metadata_product_key", sql`${table.productKey} = 'clinic'`),
  businessIsolationPolicy("file_metadata", table.businessId),
]).enableRLS();

export const businessSettings = pgTable("business_settings", {
  businessId: uuid("business_id").primaryKey().references(() => businesses.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  legalName: text("legal_name").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  email: text("email"),
  brandColor: text("brand_color"),
  invoiceHeader: text("invoice_header"),
  invoiceFooter: text("invoice_footer"),
  gstin: text("gstin"),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  terms: text("terms").notNull().default(""),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  defaultDueDays: integer("default_due_days").notNull().default(0),
  logoDataUrl: text("logo_data_url"),
  prescriptionHeader: text("prescription_header"),
  prescriptionFooter: text("prescription_footer"),
  logoFileId: uuid("logo_file_id"),
  signatureFileId: uuid("signature_file_id"),
  stampFileId: uuid("stamp_file_id"),
  updatedAt: updatedAtColumn(),
}, (table) => [
  sameBusinessForeignKey(
    "business_settings_logo_business_fk",
    [table.logoFileId, table.businessId],
    [fileMetadata.id, fileMetadata.businessId],
  ),
  sameBusinessForeignKey(
    "business_settings_signature_business_fk",
    [table.signatureFileId, table.businessId],
    [fileMetadata.id, fileMetadata.businessId],
  ),
  sameBusinessForeignKey(
    "business_settings_stamp_business_fk",
    [table.stampFileId, table.businessId],
    [fileMetadata.id, fileMetadata.businessId],
  ),
  check("business_settings_gstin", sql`${table.gstin} IS NULL OR char_length(${table.gstin}) = 15`),
  check("business_settings_prefix", sql`${table.invoicePrefix} ~ '^[A-Z0-9]{1,10}$'`),
  check("business_settings_due_days", sql`${table.defaultDueDays} BETWEEN 0 AND 365`),
  check("business_settings_currency", sql`char_length(${table.currency}) = 3`),
  businessIsolationPolicy("business_settings", table.businessId),
]).enableRLS();

export const auditLogs = pgTable("audit_logs", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAtColumn(),
}, (table) => [
  index("audit_logs_business_created_idx").on(table.businessId, table.createdAt),
  index("audit_logs_entity_idx").on(table.businessId, table.entityType, table.entityId),
  businessIsolationPolicy("audit_logs", table.businessId),
]).enableRLS();

/**
 * Local copy of the platform subscription. Clinic checks this server-side.
 * Admin updates it through the signed entitlement endpoint. It is not a
 * foreign key into the Admin database.
 */
export const subscriptionSnapshots = pgTable("subscription_snapshots", {
  businessId: uuid("business_id").primaryKey().references(() => businesses.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  planName: text("plan_name").notNull(),
  startsOn: date("starts_on").notNull(),
  expiresOn: date("expires_on").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  updatedAt: updatedAtColumn(),
}, (table) => [
  businessIsolationPolicy("subscription_snapshots", table.businessId),
]).enableRLS();
