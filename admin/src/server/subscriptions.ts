import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { getAdminDatabase, withAdminTransaction } from "@/db/transaction";
import {
  businessProvisioning,
  businessSubscriptions,
  businesses,
  subscriptionEvents,
  subscriptionPlans,
} from "@/db/schema";

import { authorize, writeAudit } from "./audit";
import { PAGE_SIZE } from "./constants";
import { AdminError } from "./errors";

const OPEN_STATUSES = ["trial", "active", "expiring_soon", "suspended"] as const;
type SubscriptionStatus = "trial" | "active" | "expiring_soon" | "expired" | "suspended" | "cancelled";

export async function getCurrentSubscription(businessId: string) {
  const [row] = await getAdminDatabase()
    .select({
      id: businessSubscriptions.id,
      status: businessSubscriptions.status,
      startsOn: businessSubscriptions.startsOn,
      expiresOn: businessSubscriptions.expiresOn,
      timezone: businessSubscriptions.timezone,
      planId: businessSubscriptions.planId,
      planName: subscriptionPlans.name,
    })
    .from(businessSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, businessSubscriptions.planId))
    .where(and(
      eq(businessSubscriptions.businessId, businessId),
      inArray(businessSubscriptions.status, [...OPEN_STATUSES]),
    ))
    .limit(1);
  return row ?? null;
}

export async function listSubscriptions(page: number) {
  const database = getAdminDatabase();
  const [total] = await database.select({ value: count() }).from(businessSubscriptions);
  const rows = await database
    .select({
      id: businessSubscriptions.id,
      status: businessSubscriptions.status,
      startsOn: businessSubscriptions.startsOn,
      expiresOn: businessSubscriptions.expiresOn,
      businessName: businesses.displayName,
      businessId: businesses.id,
      planName: subscriptionPlans.name,
    })
    .from(businessSubscriptions)
    .innerJoin(businesses, eq(businesses.id, businessSubscriptions.businessId))
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, businessSubscriptions.planId))
    .orderBy(desc(businessSubscriptions.createdAt), desc(businessSubscriptions.id))
    .limit(PAGE_SIZE)
    .offset((Math.max(1, page) - 1) * PAGE_SIZE);
  return { rows, total: total?.value ?? 0 };
}

export async function listSubscriptionHistory(businessId: string) {
  return getAdminDatabase()
    .select()
    .from(subscriptionEvents)
    .where(eq(subscriptionEvents.businessId, businessId))
    .orderBy(desc(subscriptionEvents.createdAt));
}

export async function subscriptionsForBusiness(businessId: string) {
  return getAdminDatabase()
    .select({
      id: businessSubscriptions.id,
      status: businessSubscriptions.status,
      startsOn: businessSubscriptions.startsOn,
      expiresOn: businessSubscriptions.expiresOn,
      planName: subscriptionPlans.name,
    })
    .from(businessSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, businessSubscriptions.planId))
    .where(eq(businessSubscriptions.businessId, businessId))
    .orderBy(desc(businessSubscriptions.createdAt));
}

export async function assignSubscription(input: {
  actorId: string;
  businessId: string;
  planId: string;
  startsOn: string;
  expiresOn: string;
  status?: "trial" | "active";
}) {
  await authorize(input.actorId, "subscriptions.write");
  if (input.expiresOn < input.startsOn) {
    throw new AdminError("The expiry date must be on or after the start date.");
  }
  const existing = await getCurrentSubscription(input.businessId);
  if (existing) {
    return existing.id;
  }
  const [business] = await getAdminDatabase().select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!business) {
    throw new AdminError("The business was not found.");
  }

  const id = await withAdminTransaction(async (tx) => {
    const [created] = await tx.insert(businessSubscriptions).values({
      businessId: input.businessId,
      planId: input.planId,
      status: input.status ?? "active",
      startsOn: input.startsOn,
      expiresOn: input.expiresOn,
      timezone: business.timezone,
    }).returning({ id: businessSubscriptions.id });
    if (!created) {
      throw new AdminError("The subscription could not be saved.");
    }
    await tx.insert(subscriptionEvents).values({
      subscriptionId: created.id,
      businessId: input.businessId,
      eventType: "assigned",
      toStatus: input.status ?? "active",
      toPlanId: input.planId,
      newExpiresOn: input.expiresOn,
      actorAdministratorId: input.actorId,
    });
    await writeAudit(tx, {
      actorAdministratorId: input.actorId,
      action: "subscription.activated",
      summary: "A subscription was assigned.",
      entityType: "subscription",
      entityId: created.id,
      businessId: input.businessId,
    });
    return created.id;
  });
  await sync(input.businessId);
  return id;
}

async function change(input: {
  actorId: string;
  subscriptionId: string;
  eventType: "plan_changed" | "renewed" | "extended" | "activated" | "suspended" | "reactivated" | "cancelled";
  status: SubscriptionStatus;
  planId?: string;
  expiresOn?: string;
  summary: string;
  action: string;
}) {
  await authorize(input.actorId, "subscriptions.write");
  const [current] = await getAdminDatabase().select().from(businessSubscriptions).where(eq(businessSubscriptions.id, input.subscriptionId)).limit(1);
  if (!current) {
    throw new AdminError("The subscription was not found.");
  }
  const expiresOn = input.expiresOn ?? current.expiresOn;
  if (expiresOn < current.startsOn) {
    throw new AdminError("The expiry date must be on or after the start date.");
  }
  await withAdminTransaction(async (tx) => {
    await tx.update(businessSubscriptions).set({
      status: input.status,
      planId: input.planId ?? current.planId,
      expiresOn,
      updatedAt: new Date(),
    }).where(eq(businessSubscriptions.id, current.id));
    await tx.insert(subscriptionEvents).values({
      subscriptionId: current.id,
      businessId: current.businessId,
      eventType: input.eventType,
      fromStatus: current.status,
      toStatus: input.status,
      fromPlanId: current.planId,
      toPlanId: input.planId ?? current.planId,
      previousExpiresOn: current.expiresOn,
      newExpiresOn: expiresOn,
      actorAdministratorId: input.actorId,
    });
    await writeAudit(tx, {
      actorAdministratorId: input.actorId,
      action: input.action,
      summary: input.summary,
      entityType: "subscription",
      entityId: current.id,
      businessId: current.businessId,
    });
  });
  await sync(current.businessId);
}

export function suspendSubscription(actorId: string, subscriptionId: string) {
  return change({ actorId, subscriptionId, eventType: "suspended", status: "suspended", summary: "A subscription was suspended.", action: "subscription.suspended" });
}

export function reactivateSubscription(actorId: string, subscriptionId: string) {
  return change({ actorId, subscriptionId, eventType: "reactivated", status: "active", summary: "A subscription was reactivated.", action: "subscription.reactivated" });
}

export function cancelSubscription(actorId: string, subscriptionId: string) {
  return change({ actorId, subscriptionId, eventType: "cancelled", status: "cancelled", summary: "A subscription was cancelled.", action: "subscription.cancelled" });
}

export function renewSubscription(actorId: string, subscriptionId: string, expiresOn: string) {
  return change({ actorId, subscriptionId, eventType: "renewed", status: "active", expiresOn, summary: "A subscription was renewed.", action: "subscription.renewed" });
}

export function extendSubscription(actorId: string, subscriptionId: string, expiresOn: string) {
  return change({ actorId, subscriptionId, eventType: "extended", status: "active", expiresOn, summary: "A subscription was extended.", action: "subscription.extended" });
}

export function changePlan(actorId: string, subscriptionId: string, planId: string) {
  return change({ actorId, subscriptionId, eventType: "plan_changed", status: "active", planId, summary: "A subscription plan was changed.", action: "subscription.plan_changed" });
}

export function activateSubscription(actorId: string, subscriptionId: string) {
  return change({ actorId, subscriptionId, eventType: "activated", status: "active", summary: "A subscription was activated.", action: "subscription.activated" });
}

async function sync(businessId: string) {
  const [provisioning] = await getAdminDatabase()
    .select({ productBusinessId: businessProvisioning.productBusinessId })
    .from(businessProvisioning)
    .where(eq(businessProvisioning.businessId, businessId))
    .limit(1);
  if (!provisioning?.productBusinessId) {
    return;
  }
  const { pushEntitlement } = await import("./provisioning");
  await pushEntitlement(businessId, provisioning.productBusinessId);
}

export async function expiringSoonCount() {
  const [row] = await getAdminDatabase()
    .select({ value: sql<number>`count(*)::int` })
    .from(businessSubscriptions)
    .where(and(
      inArray(businessSubscriptions.status, ["trial", "active", "expiring_soon"]),
      sql`${businessSubscriptions.expiresOn} >= current_date`,
      sql`${businessSubscriptions.expiresOn} <= current_date + 14`,
    ));
  return row?.value ?? 0;
}
