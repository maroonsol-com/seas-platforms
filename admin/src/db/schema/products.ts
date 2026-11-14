import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAtColumn, idColumn, updatedAtColumn } from "./common";
import { productStatusEnum } from "./enums";

export const saasProducts = pgTable("saas_products", {
  id: idColumn(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull().default(""),
  productUrl: text("product_url"),
  status: productStatusEnum("status").notNull().default("inactive"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("saas_products_slug_unique").on(table.slug),
  uniqueIndex("saas_products_name_unique").on(table.name),
]);

/**
 * Product-owned configuration that is safe to store in the platform database.
 * Database passwords and signing secrets do not belong in this row.
 */
export const productConfigurations = pgTable("product_configurations", {
  id: idColumn(),
  productId: uuid("product_id").notNull().references(() => saasProducts.id, { onDelete: "restrict" }),
  availableFeatures: jsonb("available_features").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("product_configurations_product_unique").on(table.productId),
]);

/**
 * How Admin reaches a product application. `secretEnvVar` is the name of an
 * environment variable, never the secret itself.
 */
export const productIntegrationConfigs = pgTable("product_integration_configs", {
  id: idColumn(),
  productId: uuid("product_id").notNull().references(() => saasProducts.id, { onDelete: "restrict" }),
  provisioningUrl: text("provisioning_url"),
  entitlementUrl: text("entitlement_url"),
  secretEnvVar: text("secret_env_var"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("product_integration_configs_product_unique").on(table.productId),
  check(
    "product_integration_secret_env_var_name",
    sql`${table.secretEnvVar} IS NULL OR ${table.secretEnvVar} ~ '^[A-Z][A-Z0-9_]*$'`,
  ),
]);
