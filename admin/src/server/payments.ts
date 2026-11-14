import { count, desc, eq } from "drizzle-orm";

import { getAdminDatabase, withAdminTransaction } from "@/db/transaction";
import { businesses, manualPayments } from "@/db/schema";

import { authorize, writeAudit } from "./audit";
import { PAGE_SIZE } from "./constants";
import { AdminError } from "./errors";

const METHODS = ["bank_transfer", "upi", "cash", "other"] as const;
export type PaymentMethod = (typeof METHODS)[number];
export type PaymentStatus = "recorded" | "received" | "voided";

export function isPaymentMethod(value: string): value is PaymentMethod {
  return METHODS.includes(value as PaymentMethod);
}

export async function listPayments(page: number, businessId?: string) {
  const where = businessId ? eq(manualPayments.businessId, businessId) : undefined;
  const database = getAdminDatabase();
  const [total] = await database.select({ value: count() }).from(manualPayments).where(where);
  const rows = await database
    .select({
      id: manualPayments.id,
      amount: manualPayments.amount,
      currency: manualPayments.currency,
      paymentDate: manualPayments.paymentDate,
      method: manualPayments.method,
      status: manualPayments.status,
      transactionReference: manualPayments.transactionReference,
      businessName: businesses.displayName,
      businessId: manualPayments.businessId,
    })
    .from(manualPayments)
    .innerJoin(businesses, eq(businesses.id, manualPayments.businessId))
    .where(where)
    .orderBy(desc(manualPayments.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows, total: total?.value ?? 0 };
}

export async function recordPayment(input: {
  actorId: string;
  businessId: string;
  subscriptionId: string | null;
  amount: string;
  currency: string;
  paymentDate: string;
  method: PaymentMethod;
  transactionReference: string | null;
  remarks: string | null;
  idempotencyKey: string;
}) {
  await authorize(input.actorId, "payments.write");
  const [existing] = await getAdminDatabase()
    .select({ id: manualPayments.id })
    .from(manualPayments)
    .where(eq(manualPayments.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (existing) {
    return existing.id;
  }

  return withAdminTransaction(async (tx) => {
    const [created] = await tx.insert(manualPayments).values({
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      paymentDate: input.paymentDate,
      method: input.method,
      transactionReference: input.transactionReference,
      remarks: input.remarks,
      status: "recorded",
      idempotencyKey: input.idempotencyKey,
      recordedBy: input.actorId,
    }).returning({ id: manualPayments.id });
    if (!created) {
      throw new AdminError("The payment could not be saved.");
    }
    await writeAudit(tx, {
      actorAdministratorId: input.actorId,
      action: "payment.recorded",
      summary: "A manual payment was recorded. The subscription was not changed.",
      entityType: "payment",
      entityId: created.id,
      businessId: input.businessId,
    });
    return created.id;
  });
}

export async function setPaymentStatus(actorId: string, paymentId: string, status: PaymentStatus) {
  await authorize(actorId, "payments.write");
  const [current] = await getAdminDatabase().select().from(manualPayments).where(eq(manualPayments.id, paymentId)).limit(1);
  if (!current) {
    throw new AdminError("The payment was not found.");
  }
  if (current.status === status) {
    return;
  }
  await withAdminTransaction(async (tx) => {
    await tx.update(manualPayments).set({ status }).where(eq(manualPayments.id, paymentId));
    await writeAudit(tx, {
      actorAdministratorId: actorId,
      action: "payment.status_changed",
      summary: "A payment status was changed. The subscription was not changed.",
      entityType: "payment",
      entityId: paymentId,
      businessId: current.businessId,
      metadata: { from: current.status, to: status },
    });
  });
}
