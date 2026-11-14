import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { queryRows, queryValue } from "@/db/rows";
import { products, services } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";

import { PAGE_SIZE } from "./constants";
import type { ClinicContext } from "./context";
import { assertPermission } from "./context";
import { ClinicError } from "./errors";
import { moneyText } from "./money";

export type CatalogueItem = {
  id: string;
  kind: "product" | "service";
  name: string;
  code: string | null;
  description: string;
  unit: string;
  price: string;
  taxClassification: string | null;
  taxRate: string | null;
  status: "active" | "inactive";
};

export type CatalogueInput = {
  name: string;
  code?: string;
  description?: string;
  unit?: string;
  sellingPrice: string;
  purchasePrice?: string;
  taxClassification?: string;
  taxRate?: string;
  status?: "active" | "inactive";
};

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function taxRate(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return moneyText(trimmed, "Tax rate", true);
}

export async function searchCatalogue(ctx: ClinicContext, query: string): Promise<CatalogueItem[]> {
  assertPermission(ctx, "products.read");
  const term = query.trim().replace(/[%_]/g, "");
  if (term.length < 1) return [];
  const pattern = `%${term}%`;
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const productRows = await tx.select().from(products).where(and(
      eq(products.businessId, ctx.businessId),
      eq(products.status, "active"),
      or(ilike(products.name, pattern), ilike(products.sku, pattern)),
    )).limit(10);
    const serviceRows = await tx.select().from(services).where(and(
      eq(services.businessId, ctx.businessId),
      eq(services.status, "active"),
      or(ilike(services.name, pattern), ilike(services.code, pattern)),
    )).limit(10);
    return [
      ...productRows.map((row) => ({
        id: row.id,
        kind: "product" as const,
        name: row.name,
        code: row.sku,
        description: row.description,
        unit: row.unit,
        price: row.sellingPrice,
        taxClassification: row.taxClassification,
        taxRate: row.taxRate,
        status: row.status,
      })),
      ...serviceRows.map((row) => ({
        id: row.id,
        kind: "service" as const,
        name: row.name,
        code: row.code,
        description: row.description,
        unit: row.unit,
        price: row.defaultPrice,
        taxClassification: row.taxClassification,
        taxRate: row.taxRate,
        status: row.status,
      })),
    ];
  }, ctx.userId);
}

export async function listProducts(ctx: ClinicContext, input: { page: number; query?: string }) {
  assertPermission(ctx, "products.read");
  const page = Math.max(1, input.page);
  const pattern = input.query?.trim() ? `%${input.query.trim().replace(/[%_]/g, "")}%` : null;
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const filters = [eq(products.businessId, ctx.businessId)];
    if (pattern) {
      const search = or(ilike(products.name, pattern), ilike(products.sku, pattern));
      if (search) filters.push(search);
    }
    const rows = await tx.select().from(products).where(and(...filters)).orderBy(desc(products.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const total = Number(await queryValue(tx, sql`
      select count(*)::text as count from products
      where business_id = ${ctx.businessId}::uuid
        and (${pattern}::text is null or name ilike ${pattern} or sku ilike ${pattern})
    `));
    return { rows, total };
  }, ctx.userId);
}

export async function getProduct(ctx: ClinicContext, productId: string) {
  assertPermission(ctx, "products.read");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [row] = await tx.select().from(products).where(and(eq(products.id, productId), eq(products.businessId, ctx.businessId))).limit(1);
    return row ?? null;
  }, ctx.userId);
}

export async function saveProduct(ctx: ClinicContext, productId: string | null, input: CatalogueInput) {
  assertPermission(ctx, "products.write");
  const name = input.name.trim();
  const sku = input.code?.trim() ?? "";
  if (!name || !sku) throw new ClinicError("Enter the product name and SKU.");
  const sellingPrice = moneyText(input.sellingPrice, "Selling price", true);
  const purchasePrice = moneyText(input.purchasePrice?.trim() ? input.purchasePrice : "0", "Purchase price", true);
  const values = {
    name,
    sku,
    description: input.description?.trim() ?? "",
    unit: input.unit?.trim() || "unit",
    sellingPrice,
    purchasePrice,
    taxClassification: optional(input.taxClassification),
    taxRate: taxRate(input.taxRate),
    status: input.status ?? "active" as const,
    updatedAt: new Date(),
  };
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [saved] = productId
      ? await tx.update(products).set(values).where(and(eq(products.id, productId), eq(products.businessId, ctx.businessId))).returning()
      : await tx.insert(products).values({ ...values, businessId: ctx.businessId }).returning();
    if (!saved) throw new ClinicError("The product could not be saved.");
    const stock = await queryRows<{ count: string }>(tx, sql`select count(*)::text as count from stock_movements where product_id = ${saved.id}::uuid`);
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, ${productId ? "product.updated" : "product.created"}, 'product', ${saved.id}::uuid, '{}'::jsonb)
    `);
    return { product: saved, stockCount: Number(stock[0]?.count ?? 0) };
  }, ctx.userId);
}

export async function setProductStatus(ctx: ClinicContext, productId: string, status: "active" | "inactive") {
  assertPermission(ctx, "products.write");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [saved] = await tx.update(products).set({ status, updatedAt: new Date() }).where(and(eq(products.id, productId), eq(products.businessId, ctx.businessId))).returning();
    if (!saved) throw new ClinicError("That product was not found.");
    return saved;
  }, ctx.userId);
}

export async function listServices(ctx: ClinicContext, input: { page: number; query?: string }) {
  assertPermission(ctx, "services.read");
  const page = Math.max(1, input.page);
  const pattern = input.query?.trim() ? `%${input.query.trim().replace(/[%_]/g, "")}%` : null;
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const filters = [eq(services.businessId, ctx.businessId)];
    if (pattern) {
      const search = or(ilike(services.name, pattern), ilike(services.code, pattern));
      if (search) filters.push(search);
    }
    const rows = await tx.select().from(services).where(and(...filters)).orderBy(desc(services.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
    const total = Number(await queryValue(tx, sql`
      select count(*)::text as count from services
      where business_id = ${ctx.businessId}::uuid
        and (${pattern}::text is null or name ilike ${pattern} or coalesce(code, '') ilike ${pattern})
    `));
    return { rows, total };
  }, ctx.userId);
}

export async function getService(ctx: ClinicContext, serviceId: string) {
  assertPermission(ctx, "services.read");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [row] = await tx.select().from(services).where(and(eq(services.id, serviceId), eq(services.businessId, ctx.businessId))).limit(1);
    return row ?? null;
  }, ctx.userId);
}

export async function saveService(ctx: ClinicContext, serviceId: string | null, input: CatalogueInput) {
  assertPermission(ctx, "services.write");
  const name = input.name.trim();
  if (!name) throw new ClinicError("Enter the service name.");
  const price = moneyText(input.sellingPrice, "Selling price", true);
  const values = {
    name,
    code: optional(input.code),
    description: input.description?.trim() ?? "",
    unit: input.unit?.trim() || "unit",
    defaultPrice: price,
    taxClassification: optional(input.taxClassification),
    taxRate: taxRate(input.taxRate),
    status: input.status ?? "active" as const,
    updatedAt: new Date(),
  };
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const before = await queryValue(tx, sql`select count(*)::text as count from stock_movements`);
    const [saved] = serviceId
      ? await tx.update(services).set(values).where(and(eq(services.id, serviceId), eq(services.businessId, ctx.businessId))).returning()
      : await tx.insert(services).values({ ...values, businessId: ctx.businessId }).returning();
    if (!saved) throw new ClinicError("The service could not be saved.");
    const after = await queryValue(tx, sql`select count(*)::text as count from stock_movements`);
    if (after !== before) throw new ClinicError("Saving a service changed stock, so the change was stopped.");
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, ${serviceId ? "service.updated" : "service.created"}, 'service', ${saved.id}::uuid, '{}'::jsonb)
    `);
    return saved;
  }, ctx.userId);
}

export async function setServiceStatus(ctx: ClinicContext, serviceId: string, status: "active" | "inactive") {
  assertPermission(ctx, "services.write");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [saved] = await tx.update(services).set({ status, updatedAt: new Date() }).where(and(eq(services.id, serviceId), eq(services.businessId, ctx.businessId))).returning();
    if (!saved) throw new ClinicError("That service was not found.");
    return saved;
  }, ctx.userId);
}
