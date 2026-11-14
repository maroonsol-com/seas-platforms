import { sql } from "drizzle-orm";
import {
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
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
import { doctorProfiles, patients } from "./clinical";
import {
  catalogStatusEnum,
  collectionMethodEnum,
  creditNoteStatusEnum,
  invoiceItemKindEnum,
  invoiceStatusEnum,
  paymentRecordStatusEnum,
} from "./enums";
import { products } from "./inventory";
import { branches, businesses, users } from "./tenancy";

export const services = pgTable("services", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description").notNull().default(""),
  unit: text("unit").notNull().default("unit"),
  defaultPrice: numeric("default_price", { precision: 14, scale: 2 }).notNull(),
  taxClassification: text("tax_classification"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),
  status: catalogStatusEnum("status").notNull().default("active"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("services_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("services_business_name_unique").on(table.businessId, table.name),
  uniqueIndex("services_business_code_unique").on(table.businessId, table.code).where(sql`${table.code} is not null`),
  check("services_price_nonnegative", sql`${table.defaultPrice} >= 0`),
  check("services_tax_rate", sql`${table.taxRate} IS NULL OR ${table.taxRate} >= 0`),
  check("services_unit_present", sql`char_length(${table.unit}) > 0`),
  check("services_code_present", sql`${table.code} IS NULL OR char_length(${table.code}) > 0`),
  businessIsolationPolicy("services", table.businessId),
]).enableRLS();

export const invoices = pgTable("invoices", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  doctorId: uuid("doctor_id"),
  invoiceNumber: text("invoice_number").notNull(),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  discountTotal: numeric("discount_total", { precision: 14, scale: 2 }).notNull().default("0"),
  taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
  creditTotal: numeric("credit_total", { precision: 14, scale: 2 }).notNull().default("0"),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  notes: text("notes"),
  terms: text("terms"),
  issuerDisplayName: text("issuer_display_name"),
  issuerLegalName: text("issuer_legal_name"),
  issuerAddress: text("issuer_address"),
  issuerPhone: text("issuer_phone"),
  issuerEmail: text("issuer_email"),
  issuerGstin: text("issuer_gstin"),
  issuerFooter: text("issuer_footer"),
  issuerLogoDataUrl: text("issuer_logo_data_url"),
  brandColor: text("brand_color"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("invoices_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("invoices_business_number_unique").on(table.businessId, table.invoiceNumber),
  index("invoices_patient_idx").on(table.businessId, table.patientId),
  index("invoices_business_date_idx").on(table.businessId, table.invoiceDate),
  index("invoices_status_idx").on(table.businessId, table.status),
  sameBusinessForeignKey(
    "invoices_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  sameBusinessForeignKey(
    "invoices_patient_business_fk",
    [table.patientId, table.businessId],
    [patients.id, patients.businessId],
  ),
  sameBusinessForeignKey(
    "invoices_doctor_business_fk",
    [table.doctorId, table.businessId],
    [doctorProfiles.id, doctorProfiles.businessId],
  ),
  check("invoices_amounts_nonnegative", sql`
    ${table.subtotal} >= 0 AND ${table.discountTotal} >= 0 AND ${table.taxTotal} >= 0
    AND ${table.total} >= 0 AND ${table.amountPaid} >= 0 AND ${table.creditTotal} >= 0
    AND ${table.creditTotal} <= ${table.total}
  `),
  check("invoices_balance_equation", sql`${table.balance} = ${table.total} - ${table.amountPaid} - ${table.creditTotal}`),
  businessIsolationPolicy("invoices", table.businessId),
]).enableRLS();

export const invoiceItems = pgTable("invoice_items", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").notNull(),
  serviceId: uuid("service_id"),
  productId: uuid("product_id"),
  kind: invoiceItemKindEnum("kind").notNull(),
  itemName: text("item_name").notNull(),
  itemCode: text("item_code"),
  description: text("description").notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 14, scale: 2 }).notNull().default("0"),
  taxClassification: text("tax_classification"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  createdAt: createdAtColumn(),
}, (table) => [
  index("invoice_items_invoice_idx").on(table.invoiceId),
  sameBusinessForeignKey(
    "invoice_items_invoice_business_fk",
    [table.invoiceId, table.businessId],
    [invoices.id, invoices.businessId],
  ),
  sameBusinessForeignKey(
    "invoice_items_service_business_fk",
    [table.serviceId, table.businessId],
    [services.id, services.businessId],
  ),
  sameBusinessForeignKey(
    "invoice_items_product_business_fk",
    [table.productId, table.businessId],
    [products.id, products.businessId],
  ),
  check("invoice_items_amounts", sql`
    ${table.quantity} > 0 AND ${table.unitPrice} >= 0 AND ${table.discount} >= 0
    AND ${table.taxRate} >= 0 AND ${table.taxAmount} >= 0 AND ${table.lineTotal} >= 0
  `),
  check("invoice_items_catalogue_reference", sql`
    (
      ${table.kind} = 'product'
      AND ${table.productId} IS NOT NULL
      AND ${table.serviceId} IS NULL
    ) OR (
      ${table.kind} IN ('service', 'consultation', 'procedure')
      AND ${table.serviceId} IS NOT NULL
      AND ${table.productId} IS NULL
    )
  `),
  check("invoice_items_snapshot_present", sql`
    char_length(${table.itemName}) > 0 AND char_length(${table.unit}) > 0
    AND (${table.itemCode} IS NULL OR char_length(${table.itemCode}) > 0)
  `),
  businessIsolationPolicy("invoice_items", table.businessId),
]).enableRLS();

export const payments = pgTable("payments", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  method: collectionMethodEnum("method").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  status: paymentRecordStatusEnum("status").notNull().default("recorded"),
  idempotencyKey: text("idempotency_key").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  receivedBy: uuid("received_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  unique("payments_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("payments_business_receipt_unique").on(table.businessId, table.receiptNumber),
  uniqueIndex("payments_idempotency_unique").on(table.idempotencyKey),
  index("payments_invoice_idx").on(table.invoiceId),
  sameBusinessForeignKey(
    "payments_invoice_business_fk",
    [table.invoiceId, table.businessId],
    [invoices.id, invoices.businessId],
  ),
  check("payments_amount_positive", sql`${table.amount} > 0`),
  businessIsolationPolicy("payments", table.businessId),
]).enableRLS();

export const refunds = pgTable("refunds", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  paymentId: uuid("payment_id").notNull(),
  invoiceId: uuid("invoice_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  reason: text("reason").notNull(),
  refundedAt: timestamp("refunded_at", { withTimezone: true }).notNull(),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  index("refunds_payment_idx").on(table.paymentId),
  index("refunds_invoice_idx").on(table.invoiceId),
  sameBusinessForeignKey(
    "refunds_payment_business_fk",
    [table.paymentId, table.businessId],
    [payments.id, payments.businessId],
  ),
  sameBusinessForeignKey(
    "refunds_invoice_business_fk",
    [table.invoiceId, table.businessId],
    [invoices.id, invoices.businessId],
  ),
  check("refunds_amount_positive", sql`${table.amount} > 0`),
  businessIsolationPolicy("refunds", table.businessId),
]).enableRLS();

export const creditNotes = pgTable("credit_notes", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").notNull(),
  creditNoteNumber: text("credit_note_number").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  reason: text("reason").notNull(),
  status: creditNoteStatusEnum("status").notNull().default("issued"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  createdAt: createdAtColumn(),
}, (table) => [
  unique("credit_notes_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("credit_notes_business_number_unique").on(table.businessId, table.creditNoteNumber),
  index("credit_notes_invoice_idx").on(table.invoiceId),
  sameBusinessForeignKey(
    "credit_notes_invoice_business_fk",
    [table.invoiceId, table.businessId],
    [invoices.id, invoices.businessId],
  ),
  check("credit_notes_amounts_nonnegative", sql`${table.amount} >= 0 AND ${table.taxAmount} >= 0`),
  businessIsolationPolicy("credit_notes", table.businessId),
]).enableRLS();

export const creditNoteItems = pgTable("credit_note_items", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  creditNoteId: uuid("credit_note_id").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  createdAt: createdAtColumn(),
}, (table) => [
  index("credit_note_items_note_idx").on(table.creditNoteId),
  sameBusinessForeignKey(
    "credit_note_items_note_business_fk",
    [table.creditNoteId, table.businessId],
    [creditNotes.id, creditNotes.businessId],
  ),
  check("credit_note_items_amounts", sql`
    ${table.quantity} > 0 AND ${table.unitPrice} >= 0 AND ${table.taxRate} >= 0
    AND ${table.taxAmount} >= 0 AND ${table.lineTotal} >= 0
  `),
  businessIsolationPolicy("credit_note_items", table.businessId),
]).enableRLS();

/** Allocates invoice numbers per business. The row lock serializes concurrent requests. */
export const invoiceSequences = pgTable("invoice_sequences", {
  businessId: uuid("business_id").primaryKey().references(() => businesses.id, { onDelete: "restrict" }),
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: updatedAtColumn(),
}, (table) => [
  check("invoice_sequences_last_number_nonnegative", sql`${table.lastNumber} >= 0`),
  businessIsolationPolicy("invoice_sequences", table.businessId),
]).enableRLS();

/** Allocates patient numbers per business. */
export const patientSequences = pgTable("patient_sequences", {
  businessId: uuid("business_id").primaryKey().references(() => businesses.id, { onDelete: "restrict" }),
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: updatedAtColumn(),
}, (table) => [
  check("patient_sequences_last_number_nonnegative", sql`${table.lastNumber} >= 0`),
  businessIsolationPolicy("patient_sequences", table.businessId),
]).enableRLS();

/** Allocates receipt numbers per business. */
export const receiptSequences = pgTable("receipt_sequences", {
  businessId: uuid("business_id").primaryKey().references(() => businesses.id, { onDelete: "restrict" }),
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: updatedAtColumn(),
}, (table) => [
  check("receipt_sequences_last_number_nonnegative", sql`${table.lastNumber} >= 0`),
  businessIsolationPolicy("receipt_sequences", table.businessId),
]).enableRLS();
