import { eq, sql } from "drizzle-orm";

import { queryRows } from "@/db/rows";
import { subscriptionSnapshots } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { localDateIso } from "@saas/shared";

import type { ClinicContext } from "./context";
import { assertPermission } from "./context";

export type FinanceSummary = {
  invoiceCount: number;
  gross: string;
  discounts: string;
  tax: string;
  net: string;
  collected: string;
  refunds: string;
  creditNotes: string;
  outstanding: string;
  customerCredit: string;
  overdueCount: number;
  draftCount: number;
  todayInvoices: number;
  todayCollected: string;
  patientCount: number;
  methods: { method: string; amount: string }[];
  recentInvoices: Record<string, string>[];
  recentPayments: Record<string, string>[];
};

function numberValue(row: Record<string, unknown> | undefined, key: string): number {
  return Number(row?.[key] ?? 0);
}

function textValue(row: Record<string, unknown> | undefined, key: string): string {
  return String(row?.[key] ?? "0");
}

export async function financeSummary(ctx: ClinicContext, range?: { from?: string; to?: string }): Promise<FinanceSummary> {
  assertPermission(ctx, "reports.read");
  const today = localDateIso(ctx.timezone);
  const from = range?.from?.trim() || null;
  const to = range?.to?.trim() || null;
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [totals] = await queryRows<Record<string, unknown>>(tx, sql`
      select
        count(*) filter (where status <> 'draft' and status <> 'cancelled')::text as invoice_count,
        coalesce(sum(subtotal) filter (where status <> 'draft' and status <> 'cancelled'), 0)::text as gross,
        coalesce(sum(discount_total) filter (where status <> 'draft' and status <> 'cancelled'), 0)::text as discounts,
        coalesce(sum(tax_total) filter (where status <> 'draft' and status <> 'cancelled'), 0)::text as tax,
        coalesce(sum(total) filter (where status <> 'draft' and status <> 'cancelled'), 0)::text as net,
        coalesce(sum(greatest(balance, 0)) filter (where status in ('finalized', 'partially_paid', 'paid')), 0)::text as outstanding,
        coalesce(sum(greatest(-balance, 0)) filter (where status in ('finalized', 'partially_paid', 'paid')), 0)::text as customer_credit,
        count(*) filter (where due_date < ${today}::date and balance > 0 and status in ('finalized', 'partially_paid'))::text as overdue_count,
        count(*) filter (where status = 'draft')::text as draft_count,
        count(*) filter (where invoice_date = ${today}::date and status <> 'cancelled')::text as today_invoices
      from invoices
      where business_id = ${ctx.businessId}::uuid
        and (${from}::date is null or invoice_date >= ${from}::date)
        and (${to}::date is null or invoice_date <= ${to}::date)
    `);
    const [cash] = await queryRows<Record<string, unknown>>(tx, sql`
      select
        coalesce(sum(amount) filter (where status = 'recorded'), 0)::text as collected,
        coalesce(sum(amount) filter (where (received_at at time zone ${ctx.timezone})::date = ${today}::date and status = 'recorded'), 0)::text as today_collected
      from payments
      where business_id = ${ctx.businessId}::uuid
        and (${from}::date is null or (received_at at time zone ${ctx.timezone})::date >= ${from}::date)
        and (${to}::date is null or (received_at at time zone ${ctx.timezone})::date <= ${to}::date)
    `);
    const [refunded] = await queryRows<Record<string, unknown>>(tx, sql`
      select coalesce(sum(amount), 0)::text as refunds
      from refunds
      where business_id = ${ctx.businessId}::uuid
        and (${from}::date is null or (refunded_at at time zone ${ctx.timezone})::date >= ${from}::date)
        and (${to}::date is null or (refunded_at at time zone ${ctx.timezone})::date <= ${to}::date)
    `);
    const [credits] = await queryRows<Record<string, unknown>>(tx, sql`
      select coalesce(sum(amount) filter (where status = 'issued'), 0)::text as credit_notes
      from credit_notes
      where business_id = ${ctx.businessId}::uuid
        and (${from}::date is null or (issued_at at time zone ${ctx.timezone})::date >= ${from}::date)
        and (${to}::date is null or (issued_at at time zone ${ctx.timezone})::date <= ${to}::date)
    `);
    const [patients] = await queryRows<Record<string, unknown>>(tx, sql`
      select count(*)::text as patient_count from patients where business_id = ${ctx.businessId}::uuid and is_active = true
    `);
    const methods = await queryRows<{ method: string; amount: string }>(tx, sql`
      select method::text as method, coalesce(sum(amount), 0)::text as amount
      from payments
      where business_id = ${ctx.businessId}::uuid and status = 'recorded'
        and (${from}::date is null or (received_at at time zone ${ctx.timezone})::date >= ${from}::date)
        and (${to}::date is null or (received_at at time zone ${ctx.timezone})::date <= ${to}::date)
      group by method
      order by method
    `);
    const recentInvoices = await queryRows<Record<string, string>>(tx, sql`
      select invoices.invoice_number, invoices.total::text as total, invoices.balance::text as balance, invoices.status,
             patients.full_name
      from invoices
      join patients on patients.id = invoices.patient_id
      where invoices.business_id = ${ctx.businessId}::uuid
      order by invoices.created_at desc
      limit 8
    `);
    const recentPayments = await queryRows<Record<string, string>>(tx, sql`
      select payments.receipt_number, payments.amount::text as amount, payments.method::text as method,
             invoices.invoice_number
      from payments
      join invoices on invoices.id = payments.invoice_id
      where payments.business_id = ${ctx.businessId}::uuid
      order by payments.received_at desc
      limit 8
    `);
    return {
      invoiceCount: numberValue(totals, "invoice_count"),
      gross: textValue(totals, "gross"),
      discounts: textValue(totals, "discounts"),
      tax: textValue(totals, "tax"),
      net: textValue(totals, "net"),
      collected: textValue(cash, "collected"),
      refunds: textValue(refunded, "refunds"),
      creditNotes: textValue(credits, "credit_notes"),
      outstanding: textValue(totals, "outstanding"),
      customerCredit: textValue(totals, "customer_credit"),
      overdueCount: numberValue(totals, "overdue_count"),
      draftCount: numberValue(totals, "draft_count"),
      todayInvoices: numberValue(totals, "today_invoices"),
      todayCollected: textValue(cash, "today_collected"),
      patientCount: numberValue(patients, "patient_count"),
      methods,
      recentInvoices,
      recentPayments,
    };
  }, ctx.userId);
}

export async function subscriptionNotice(ctx: ClinicContext) {
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [snapshot] = await tx.select().from(subscriptionSnapshots).where(eq(subscriptionSnapshots.businessId, ctx.businessId)).limit(1);
    return snapshot ?? null;
  }, ctx.userId);
}
