import { count, desc, eq, ilike, or } from "drizzle-orm";

import { getAdminDatabase, withAdminTransaction } from "@/db/transaction";
import {
  productConfigurations,
  productIntegrationConfigs,
  saasProducts,
} from "@/db/schema";

import { authorize, writeAudit } from "./audit";
import { AdminError } from "./errors";
import { PAGE_SIZE } from "./constants";

export async function listProducts(input: { page: number; query?: string }) {
  const query = input.query?.trim();
  const where = query
    ? or(ilike(saasProducts.name, `%${query}%`), ilike(saasProducts.slug, `%${query}%`))
    : undefined;
  const database = getAdminDatabase();
  const [total] = await database.select({ value: count() }).from(saasProducts).where(where);
  const rows = await database
    .select()
    .from(saasProducts)
    .where(where)
    .orderBy(desc(saasProducts.createdAt))
    .limit(PAGE_SIZE)
    .offset((input.page - 1) * PAGE_SIZE);
  return { rows, total: total?.value ?? 0 };
}

export async function getProduct(id: string) {
  const [product] = await getAdminDatabase().select().from(saasProducts).where(eq(saasProducts.id, id)).limit(1);
  if (!product) {
    return null;
  }
  const [configuration] = await getAdminDatabase()
    .select()
    .from(productConfigurations)
    .where(eq(productConfigurations.productId, id))
    .limit(1);
  const [integration] = await getAdminDatabase()
    .select()
    .from(productIntegrationConfigs)
    .where(eq(productIntegrationConfigs.productId, id))
    .limit(1);
  return { product, configuration, integration };
}

export async function saveProduct(input: {
  actorId: string;
  id?: string;
  name: string;
  slug: string;
  description: string;
  productUrl: string | null;
  status: "active" | "inactive";
  features: string[];
  metadata: Record<string, unknown>;
  provisioningUrl: string | null;
  entitlementUrl: string | null;
  secretEnvVar: string | null;
}) {
  await authorize(input.actorId, "products.write");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    throw new AdminError("The product slug must use lowercase letters, numbers, and hyphens.");
  }

  return withAdminTransaction(async (tx) => {
    const values = {
      name: input.name,
      slug: input.slug,
      description: input.description,
      productUrl: input.productUrl,
      status: input.status,
      updatedAt: new Date(),
    };
    const productId = input.id
      ? input.id
      : (await tx.insert(saasProducts).values(values).returning({ id: saasProducts.id }))[0]?.id;

    if (!productId) {
      throw new AdminError("The product could not be saved.");
    }
    if (input.id) {
      await tx.update(saasProducts).set(values).where(eq(saasProducts.id, productId));
    }

    const [configuration] = await tx
      .select({ id: productConfigurations.id })
      .from(productConfigurations)
      .where(eq(productConfigurations.productId, productId))
      .limit(1);
    if (configuration) {
      await tx.update(productConfigurations).set({
        availableFeatures: input.features,
        metadata: input.metadata,
        updatedAt: new Date(),
      }).where(eq(productConfigurations.productId, productId));
    } else {
      await tx.insert(productConfigurations).values({
        productId,
        availableFeatures: input.features,
        metadata: input.metadata,
      });
    }

    const [integration] = await tx
      .select({ id: productIntegrationConfigs.id })
      .from(productIntegrationConfigs)
      .where(eq(productIntegrationConfigs.productId, productId))
      .limit(1);
    const integrationValues = {
      provisioningUrl: input.provisioningUrl,
      entitlementUrl: input.entitlementUrl,
      secretEnvVar: input.secretEnvVar,
      updatedAt: new Date(),
    };
    if (integration) {
      await tx.update(productIntegrationConfigs).set(integrationValues).where(eq(productIntegrationConfigs.productId, productId));
    } else {
      await tx.insert(productIntegrationConfigs).values({ productId, ...integrationValues });
    }

    await writeAudit(tx, {
      actorAdministratorId: input.actorId,
      action: input.id ? "product.updated" : "product.created",
      summary: input.id ? "A product was updated." : "A product was created.",
      entityType: "product",
      entityId: productId,
      productId,
    });
    return productId;
  });
}

export async function setProductStatus(actorId: string, productId: string, status: "active" | "inactive") {
  await authorize(actorId, "products.write");
  await withAdminTransaction(async (tx) => {
    await tx.update(saasProducts).set({ status, updatedAt: new Date() }).where(eq(saasProducts.id, productId));
    await writeAudit(tx, {
      actorAdministratorId: actorId,
      action: status === "active" ? "product.activated" : "product.deactivated",
      summary: status === "active" ? "A product was activated." : "A product was deactivated.",
      entityType: "product",
      entityId: productId,
      productId,
    });
  });
}
