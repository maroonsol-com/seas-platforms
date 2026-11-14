import { and, count, desc, eq } from "drizzle-orm";

import { getAdminDatabase, withAdminTransaction } from "@/db/transaction";
import { planFeatures, saasProducts, subscriptionPlans } from "@/db/schema";

import { authorize, writeAudit } from "./audit";
import { PAGE_SIZE } from "./constants";

const CYCLES = ["monthly", "quarterly", "half_yearly", "yearly", "custom"] as const;
export type BillingCycle = (typeof CYCLES)[number];

export function isBillingCycle(value: string): value is BillingCycle {
  return CYCLES.includes(value as BillingCycle);
}

export async function listPlans(page: number, productId?: string) {
  const where = productId ? eq(subscriptionPlans.productId, productId) : undefined;
  const database = getAdminDatabase();
  const [total] = await database.select({ value: count() }).from(subscriptionPlans).where(where);
  const rows = await database
    .select({
      id: subscriptionPlans.id,
      name: subscriptionPlans.name,
      price: subscriptionPlans.price,
      currency: subscriptionPlans.currency,
      billingCycle: subscriptionPlans.billingCycle,
      status: subscriptionPlans.status,
      productName: saasProducts.name,
      productId: subscriptionPlans.productId,
    })
    .from(subscriptionPlans)
    .innerJoin(saasProducts, eq(saasProducts.id, subscriptionPlans.productId))
    .where(where)
    .orderBy(desc(subscriptionPlans.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows, total: total?.value ?? 0 };
}

export async function getPlan(id: string) {
  const [plan] = await getAdminDatabase().select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
  if (!plan) {
    return null;
  }
  const features = await getAdminDatabase().select().from(planFeatures).where(eq(planFeatures.planId, id));
  return { plan, features };
}

export async function savePlan(input: {
  actorId: string;
  id?: string;
  productId: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  billingCycle: BillingCycle;
  trialDays: number;
  graceDays: number;
  maxUsers: number | null;
  maxBranches: number | null;
  storageLimitMb: number | null;
  features: string[];
  status: "active" | "inactive";
}) {
  await authorize(input.actorId, "plans.write");
  return withAdminTransaction(async (tx) => {
    const values = {
      productId: input.productId,
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency.toUpperCase(),
      billingCycle: input.billingCycle,
      trialDays: input.trialDays,
      graceDays: input.graceDays,
      maxUsers: input.maxUsers,
      maxBranches: input.maxBranches,
      storageLimitMb: input.storageLimitMb,
      status: input.status,
      updatedAt: new Date(),
    };
    const planId = input.id
      ? input.id
      : (await tx.insert(subscriptionPlans).values(values).returning({ id: subscriptionPlans.id }))[0]?.id;
    if (!planId) {
      throw new Error("The plan could not be saved.");
    }
    if (input.id) {
      await tx.update(subscriptionPlans).set(values).where(eq(subscriptionPlans.id, planId));
      await tx.delete(planFeatures).where(eq(planFeatures.planId, planId));
    }
    if (input.features.length > 0) {
      await tx.insert(planFeatures).values(input.features.map((featureKey) => ({
        planId,
        featureKey,
        enabled: true,
      })));
    }
    await writeAudit(tx, {
      actorAdministratorId: input.actorId,
      action: input.id ? "plan.updated" : "plan.created",
      summary: input.id ? "A subscription plan was updated." : "A subscription plan was created.",
      entityType: "plan",
      entityId: planId,
      productId: input.productId,
    });
    return planId;
  });
}

export async function listActivePlansForProduct(productId: string) {
  return getAdminDatabase()
    .select({ id: subscriptionPlans.id, name: subscriptionPlans.name, currency: subscriptionPlans.currency, price: subscriptionPlans.price, billingCycle: subscriptionPlans.billingCycle })
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.productId, productId), eq(subscriptionPlans.status, "active")));
}
