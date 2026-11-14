import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { getAdminDatabase } from "@/db/transaction";
import {
  administrativeActivityLogs,
  businessSubscriptions,
  businesses,
  manualPayments,
  saasProducts,
} from "@/db/schema";

export async function dashboardMetrics() {
  const database = getAdminDatabase();
  const [products] = await database.select({ value: count() }).from(saasProducts);
  const [activeProducts] = await database.select({ value: count() }).from(saasProducts).where(eq(saasProducts.status, "active"));
  const [totalBusinesses] = await database.select({ value: count() }).from(businesses);
  const [activeBusinesses] = await database.select({ value: count() }).from(businesses).where(eq(businesses.status, "active"));
  const [suspendedBusinesses] = await database.select({ value: count() }).from(businesses).where(eq(businesses.status, "suspended"));
  const [expiredBusinesses] = await database.select({ value: sql<number>`count(distinct ${businesses.id})::int` })
    .from(businesses)
    .innerJoin(businessSubscriptions, eq(businessSubscriptions.businessId, businesses.id))
    .where(sql`${businessSubscriptions.expiresOn} < current_date and ${businessSubscriptions.status} in ('trial', 'active', 'expiring_soon', 'expired')`);
  const [activeSubscriptions] = await database.select({ value: count() }).from(businessSubscriptions).where(and(
    inArray(businessSubscriptions.status, ["trial", "active", "expiring_soon"]),
    sql`${businessSubscriptions.expiresOn} >= current_date`,
  ));
  const [expiringSoon] = await database.select({ value: count() }).from(businessSubscriptions).where(and(
    inArray(businessSubscriptions.status, ["trial", "active", "expiring_soon"]),
    sql`${businessSubscriptions.expiresOn} >= current_date and ${businessSubscriptions.expiresOn} <= current_date + 14`,
  ));
  const payments = await database
    .select({
      id: manualPayments.id,
      amount: manualPayments.amount,
      currency: manualPayments.currency,
      paymentDate: manualPayments.paymentDate,
      method: manualPayments.method,
      businessName: businesses.displayName,
    })
    .from(manualPayments)
    .innerJoin(businesses, eq(businesses.id, manualPayments.businessId))
    .orderBy(desc(manualPayments.createdAt))
    .limit(5);
  const activity = await database
    .select({
      id: administrativeActivityLogs.id,
      summary: administrativeActivityLogs.summary,
      createdAt: administrativeActivityLogs.createdAt,
    })
    .from(administrativeActivityLogs)
    .orderBy(desc(administrativeActivityLogs.createdAt))
    .limit(8);

  return {
    products: products?.value ?? 0,
    activeProducts: activeProducts?.value ?? 0,
    totalBusinesses: totalBusinesses?.value ?? 0,
    activeBusinesses: activeBusinesses?.value ?? 0,
    suspendedBusinesses: suspendedBusinesses?.value ?? 0,
    expiredBusinesses: expiredBusinesses?.value ?? 0,
    activeSubscriptions: activeSubscriptions?.value ?? 0,
    expiringSoon: expiringSoon?.value ?? 0,
    payments,
    activity,
  };
}
