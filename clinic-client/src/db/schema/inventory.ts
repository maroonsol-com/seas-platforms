import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
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
import { catalogStatusEnum, stockMovementKindEnum } from "./enums";
import { branches, businesses, users } from "./tenancy";

export const inventoryCategories = pgTable("inventory_categories", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("inventory_categories_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("inventory_categories_business_name_unique").on(table.businessId, table.name),
  businessIsolationPolicy("inventory_categories", table.businessId),
]).enableRLS();

export const products = pgTable("products", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  categoryId: uuid("category_id"),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  description: text("description").notNull().default(""),
  unit: text("unit").notNull().default("unit"),
  barcode: text("barcode"),
  purchasePrice: numeric("purchase_price", { precision: 14, scale: 2 }).notNull(),
  sellingPrice: numeric("selling_price", { precision: 14, scale: 2 }).notNull(),
  taxClassification: text("tax_classification"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),
  reorderLevel: numeric("reorder_level", { precision: 14, scale: 3 }).notNull().default("0"),
  status: catalogStatusEnum("status").notNull().default("active"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("products_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("products_business_sku_unique").on(table.businessId, table.sku),
  index("products_business_name_idx").on(table.businessId, table.name),
  sameBusinessForeignKey(
    "products_category_business_fk",
    [table.categoryId, table.businessId],
    [inventoryCategories.id, inventoryCategories.businessId],
  ),
  check("products_prices_nonnegative", sql`
    ${table.purchasePrice} >= 0 AND ${table.sellingPrice} >= 0 AND ${table.reorderLevel} >= 0
    AND (${table.taxRate} IS NULL OR ${table.taxRate} >= 0)
  `),
  check("products_unit_present", sql`char_length(${table.unit}) > 0`),
  businessIsolationPolicy("products", table.businessId),
]).enableRLS();

/**
 * Append-only stock ledger. Quantity is signed: positive receives stock and
 * negative issues it. On-hand quantity is the sum of movements, not a separately
 * edited balance.
 */
export const stockMovements = pgTable("stock_movements", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  productId: uuid("product_id").notNull(),
  branchId: uuid("branch_id"),
  kind: stockMovementKindEnum("kind").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  batchNumber: text("batch_number"),
  expiresOn: date("expires_on"),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
  sourceType: text("source_type"),
  sourceId: uuid("source_id"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  index("stock_movements_product_idx").on(table.businessId, table.productId),
  index("stock_movements_branch_idx").on(table.businessId, table.branchId),
  sameBusinessForeignKey(
    "stock_movements_product_business_fk",
    [table.productId, table.businessId],
    [products.id, products.businessId],
  ),
  sameBusinessForeignKey(
    "stock_movements_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  check("stock_movements_quantity_nonzero", sql`${table.quantity} <> 0`),
  check("stock_movements_unit_cost_nonnegative", sql`${table.unitCost} IS NULL OR ${table.unitCost} >= 0`),
  businessIsolationPolicy("stock_movements", table.businessId),
]).enableRLS();
