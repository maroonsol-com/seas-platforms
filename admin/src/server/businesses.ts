import { and, count, desc, eq, ilike, or } from "drizzle-orm";

import { getAdminDatabase, withAdminTransaction } from "@/db/transaction";
import {
  businessProducts,
  businessProvisioning,
  businesses,
  saasProducts,
} from "@/db/schema";

import { authorize, writeAudit } from "./audit";
import { PAGE_SIZE } from "./constants";
import { AdminError } from "./errors";

export type BusinessInput = {
  actorId: string;
  id?: string;
  legalName: string;
  displayName: string;
  businessType: string;
  ownerName: string;
  ownerEmail: string;
  ownerMobile: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstin: string | null;
  timezone: string;
  internalNotes: string | null;
  productId: string;
  planId: string | null;
  startsOn: string | null;
  expiresOn: string | null;
};

export async function listBusinesses(input: { page: number; query?: string; productId?: string; status?: string }) {
  const filters = [];
  if (input.query) {
    filters.push(or(
      ilike(businesses.legalName, `%${input.query}%`),
      ilike(businesses.displayName, `%${input.query}%`),
      ilike(businesses.ownerEmail, `%${input.query}%`),
    ));
  }
  if (input.status === "provisioning_pending" || input.status === "active" || input.status === "suspended" || input.status === "archived") {
    filters.push(eq(businesses.status, input.status));
  }
  if (input.productId) {
    filters.push(eq(businessProducts.productId, input.productId));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;
  const database = getAdminDatabase();
  const base = database
    .select({
      id: businesses.id,
      legalName: businesses.legalName,
      displayName: businesses.displayName,
      ownerEmail: businesses.ownerEmail,
      status: businesses.status,
      productName: saasProducts.name,
      provisioningStatus: businessProvisioning.status,
    })
    .from(businesses)
    .innerJoin(businessProducts, eq(businessProducts.businessId, businesses.id))
    .innerJoin(saasProducts, eq(saasProducts.id, businessProducts.productId))
    .leftJoin(businessProvisioning, eq(businessProvisioning.businessId, businesses.id))
    .where(where);

  const [total] = await database
    .select({ value: count() })
    .from(businesses)
    .innerJoin(businessProducts, eq(businessProducts.businessId, businesses.id))
    .where(where);
  const rows = await base.orderBy(desc(businesses.createdAt)).limit(PAGE_SIZE).offset((input.page - 1) * PAGE_SIZE);
  return { rows, total: total?.value ?? 0 };
}

export async function getBusiness(id: string) {
  const [business] = await getAdminDatabase().select().from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!business) {
    return null;
  }
  const [link] = await getAdminDatabase()
    .select({ productId: businessProducts.productId, productName: saasProducts.name })
    .from(businessProducts)
    .innerJoin(saasProducts, eq(saasProducts.id, businessProducts.productId))
    .where(eq(businessProducts.businessId, id))
    .limit(1);
  const [provisioning] = await getAdminDatabase()
    .select()
    .from(businessProvisioning)
    .where(eq(businessProvisioning.businessId, id))
    .limit(1);
  return { business, link, provisioning };
}

export async function saveBusiness(input: BusinessInput) {
  await authorize(input.actorId, "businesses.write");
  if (input.startsOn && input.expiresOn && input.expiresOn < input.startsOn) {
    throw new AdminError("The expiry date must be on or after the start date.");
  }

  return withAdminTransaction(async (tx) => {
    const values = {
      legalName: input.legalName,
      displayName: input.displayName,
      businessType: input.businessType,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      ownerMobile: input.ownerMobile,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country || "IN",
      gstin: input.gstin,
      timezone: input.timezone || "Asia/Kolkata",
      internalNotes: input.internalNotes,
      updatedAt: new Date(),
    };

    if (input.id) {
      await tx.update(businesses).set(values).where(eq(businesses.id, input.id));
      if (input.planId || input.startsOn || input.expiresOn) {
        await tx.update(businessProvisioning).set({
          requestedPlanId: input.planId,
          requestedStartsOn: input.startsOn,
          requestedExpiresOn: input.expiresOn,
          updatedAt: new Date(),
        }).where(eq(businessProvisioning.businessId, input.id));
      }
      await writeAudit(tx, {
        actorAdministratorId: input.actorId,
        action: "business.updated",
        summary: "A business was updated.",
        entityType: "business",
        entityId: input.id,
        businessId: input.id,
        productId: input.productId,
      });
      return input.id;
    }

    const [created] = await tx.insert(businesses).values({
      ...values,
      status: "provisioning_pending",
    }).returning({ id: businesses.id });
    if (!created) {
      throw new AdminError("The business could not be saved.");
    }
    await tx.insert(businessProducts).values({ businessId: created.id, productId: input.productId });
    await tx.insert(businessProvisioning).values({
      businessId: created.id,
      productId: input.productId,
      idempotencyKey: crypto.randomUUID(),
      status: "pending",
      requestedPlanId: input.planId,
      requestedStartsOn: input.startsOn,
      requestedExpiresOn: input.expiresOn,
    });
    await writeAudit(tx, {
      actorAdministratorId: input.actorId,
      action: "business.created",
      summary: "A business was created and queued for provisioning.",
      entityType: "business",
      entityId: created.id,
      businessId: created.id,
      productId: input.productId,
    });
    return created.id;
  });
}

export async function setBusinessStatus(actorId: string, businessId: string, status: "active" | "suspended") {
  await authorize(actorId, "businesses.write");
  const [current] = await getAdminDatabase().select({ status: businesses.status }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!current) {
    throw new AdminError("The business was not found.");
  }
  if (status === "active" && current.status === "provisioning_pending") {
    throw new AdminError("Provision the business before activating it.");
  }
  await withAdminTransaction(async (tx) => {
    await tx.update(businesses).set({ status, updatedAt: new Date() }).where(eq(businesses.id, businessId));
    await writeAudit(tx, {
      actorAdministratorId: actorId,
      action: status === "suspended" ? "business.suspended" : "business.reactivated",
      summary: status === "suspended" ? "A business was suspended." : "A business was reactivated.",
      entityType: "business",
      entityId: businessId,
      businessId,
    });
  });
}

export async function listBusinessOptions() {
  return getAdminDatabase()
    .select({ id: businesses.id, displayName: businesses.displayName })
    .from(businesses)
    .orderBy(businesses.displayName);
}

export async function countBusinessesByProduct(productId: string) {
  const [row] = await getAdminDatabase()
    .select({ value: count() })
    .from(businessProducts)
    .where(eq(businessProducts.productId, productId));
  return row?.value ?? 0;
}

export async function businessesForProduct(productId: string) {
  return getAdminDatabase()
    .select({
      id: businesses.id,
      displayName: businesses.displayName,
      status: businesses.status,
    })
    .from(businesses)
    .innerJoin(businessProducts, eq(businessProducts.businessId, businesses.id))
    .where(eq(businessProducts.productId, productId))
    .orderBy(desc(businesses.createdAt))
    .limit(20);
}
