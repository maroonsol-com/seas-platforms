import { sql } from "drizzle-orm";
import {
  char,
  check,
  date,
  index,
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
import { collectionMethodEnum, purchaseStatusEnum } from "./enums";
import { products } from "./inventory";
import { branches, businesses, users } from "./tenancy";

export const suppliers = pgTable("suppliers", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  gstin: text("gstin"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("suppliers_id_business_unique").on(table.id, table.businessId),
  index("suppliers_business_name_idx").on(table.businessId, table.name),
  check("suppliers_gstin_length", sql`${table.gstin} IS NULL OR char_length(${table.gstin}) = 15`),
  businessIsolationPolicy("suppliers", table.businessId),
]).enableRLS();

export const purchases = pgTable("purchases", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  supplierId: uuid("supplier_id").notNull(),
  branchId: uuid("branch_id"),
  purchaseNumber: text("purchase_number").notNull(),
  status: purchaseStatusEnum("status").notNull().default("draft"),
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("purchases_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("purchases_business_number_unique").on(table.businessId, table.purchaseNumber),
  index("purchases_supplier_idx").on(table.businessId, table.supplierId),
  sameBusinessForeignKey(
    "purchases_supplier_business_fk",
    [table.supplierId, table.businessId],
    [suppliers.id, suppliers.businessId],
  ),
  sameBusinessForeignKey(
    "purchases_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  check("purchases_amounts_nonnegative", sql`${table.subtotal} >= 0 AND ${table.taxTotal} >= 0 AND ${table.total} >= 0`),
  businessIsolationPolicy("purchases", table.businessId),
]).enableRLS();

export const purchaseItems = pgTable("purchase_items", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  purchaseId: uuid("purchase_id").notNull(),
  productId: uuid("product_id").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  batchNumber: text("batch_number"),
  expiresOn: date("expires_on"),
  createdAt: createdAtColumn(),
}, (table) => [
  index("purchase_items_purchase_idx").on(table.purchaseId),
  sameBusinessForeignKey(
    "purchase_items_purchase_business_fk",
    [table.purchaseId, table.businessId],
    [purchases.id, purchases.businessId],
  ),
  sameBusinessForeignKey(
    "purchase_items_product_business_fk",
    [table.productId, table.businessId],
    [products.id, products.businessId],
  ),
  check("purchase_items_amounts", sql`
    ${table.quantity} > 0 AND ${table.unitCost} >= 0 AND ${table.taxRate} >= 0
    AND ${table.taxAmount} >= 0 AND ${table.lineTotal} >= 0
  `),
  businessIsolationPolicy("purchase_items", table.businessId),
]).enableRLS();

export const supplierPayments = pgTable("supplier_payments", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  supplierId: uuid("supplier_id").notNull(),
  purchaseId: uuid("purchase_id"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("INR"),
  method: collectionMethodEnum("method").notNull(),
  paidOn: date("paid_on").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  index("supplier_payments_supplier_idx").on(table.businessId, table.supplierId),
  index("supplier_payments_purchase_idx").on(table.purchaseId),
  sameBusinessForeignKey(
    "supplier_payments_supplier_business_fk",
    [table.supplierId, table.businessId],
    [suppliers.id, suppliers.businessId],
  ),
  sameBusinessForeignKey(
    "supplier_payments_purchase_business_fk",
    [table.purchaseId, table.businessId],
    [purchases.id, purchases.businessId],
  ),
  check("supplier_payments_amount_positive", sql`${table.amount} > 0`),
  businessIsolationPolicy("supplier_payments", table.businessId),
]).enableRLS();
