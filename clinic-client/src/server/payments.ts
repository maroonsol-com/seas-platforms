import { and, desc, eq, sql } from "drizzle-orm";

import { queryRows, queryValue } from "@/db/rows";
import { creditNotes, payments } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";

import { PAGE_SIZE } from "./constants";
import type { ClinicContext } from "./context";
import { assertPermission } from "./context";
import { ClinicError } from "./errors";
import { moneyText } from "./money";

const METHODS = new Set(["cash", "upi", "card", "bank_transfer", "other"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type PaymentInput = {
  invoiceId: string;
  amount: string;
  date: string;
  method: string;
  reference?: string;
  notes?: string;
  idempotencyKey: string;
};

async function syncInvoiceBalance(tx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0], invoiceId: string) {
  const rows = await queryRows<{ id: string }>(tx, sql`
    update invoices
    set
      amount_paid = collected.paid,
      credit_total = collected.credits,
      balance = invoices.total - collected.paid - collected.credits,
      status = case
        when invoices.status = 'cancelled' then invoices.status
        when collected.paid <= 0 then 'finalized'
        when invoices.total - collected.paid - collected.credits <= 0 then 'paid'
        else 'partially_paid'
      end,
      updated_at = now()
    from (
      select
        coalesce((select sum(amount) from payments where invoice_id = ${invoiceId}::uuid and status = 'recorded'), 0)
        - coalesce((select sum(amount) from refunds where invoice_id = ${invoiceId}::uuid), 0) as paid,
        coalesce((select sum(amount) from credit_notes where invoice_id = ${invoiceId}::uuid and status = 'issued'), 0) as credits
    ) collected
    where invoices.id = ${invoiceId}::uuid
      and invoices.status <> 'draft'
      and collected.paid >= 0
      and collected.paid <= invoices.total
      and collected.credits >= 0
      and collected.credits <= invoices.total
    returning invoices.id
  `);
  if (!rows[0]) throw new ClinicError("The invoice balance could not be updated.");
}

export async function recordPayment(ctx: ClinicContext, input: PaymentInput) {
  assertPermission(ctx, "payments.write");
  const amount = moneyText(input.amount, "Payment amount", false);
  if (!DATE.test(input.date)) throw new ClinicError("Enter the payment date.");
  if (!METHODS.has(input.method)) throw new ClinicError("Choose a payment method.");
  const key = input.idempotencyKey.trim();
  if (key.length < 8) throw new ClinicError("The payment could not be identified for a safe retry.");

  return withTenantTransaction(ctx.businessId, async (tx) => {
    await tx.execute(sql`select id from invoices where id = ${input.invoiceId}::uuid and business_id = ${ctx.businessId}::uuid for update`);
    const existing = await queryRows<{ id: string; invoice_id: string }>(tx, sql`
      select id, invoice_id from payments where idempotency_key = ${key} limit 1
    `);
    if (existing[0]) {
      if (existing[0].invoice_id !== input.invoiceId) throw new ClinicError("This payment reference was already used.");
      return { id: existing[0].id, duplicate: true };
    }
    const receiptNumber = await queryValue(tx, sql`select next_receipt_number(${ctx.businessId}::uuid) as allocated`);
    const inserted = await queryRows<{ id: string }>(tx, sql`
      insert into payments (
        business_id, invoice_id, receipt_number, amount, currency, method, reference, notes,
        status, idempotency_key, received_at, received_by
      )
      select
        invoices.business_id,
        invoices.id,
        ${receiptNumber},
        ${amount}::numeric,
        invoices.currency,
        ${input.method}::collection_method,
        ${input.reference?.trim() || null},
        ${input.notes?.trim() || null},
        'recorded',
        ${key},
        (${input.date}::timestamp at time zone ${ctx.timezone}),
        ${ctx.userId}::uuid
      from invoices
      where invoices.id = ${input.invoiceId}::uuid
        and invoices.business_id = ${ctx.businessId}::uuid
        and invoices.status in ('finalized', 'partially_paid')
        and invoices.balance >= ${amount}::numeric
        and invoices.balance > 0
      returning payments.id
    `);
    const payment = inserted[0];
    if (!payment) throw new ClinicError("The payment is larger than the outstanding balance, or the invoice cannot accept a payment.");
    await syncInvoiceBalance(tx, input.invoiceId);
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'payment.recorded', 'payment', ${payment.id}::uuid, ${JSON.stringify({ invoiceId: input.invoiceId, amount })}::jsonb)
    `);
    return { id: payment.id, duplicate: false };
  }, ctx.userId);
}

export async function refundPayment(ctx: ClinicContext, paymentId: string, amountInput: string, reason: string) {
  assertPermission(ctx, "payments.write");
  const amount = moneyText(amountInput, "Refund amount", false);
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new ClinicError("Enter a reason for the refund.");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [payment] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.businessId, ctx.businessId))).limit(1);
    if (!payment || payment.status !== "recorded") throw new ClinicError("That payment was not found.");
    const already = await queryValue(tx, sql`select coalesce(sum(amount), 0)::text as amount from refunds where payment_id = ${paymentId}::uuid`);
    const rows = await queryRows<{ id: string }>(tx, sql`
      insert into refunds (business_id, payment_id, invoice_id, amount, currency, reason, refunded_at, recorded_by)
      select business_id, id, invoice_id, ${amount}::numeric, currency, ${trimmed}, now(), ${ctx.userId}::uuid
      from payments
      where id = ${paymentId}::uuid
        and business_id = ${ctx.businessId}::uuid
        and status = 'recorded'
        and amount - ${already}::numeric >= ${amount}::numeric
      returning id
    `);
    const refund = rows[0];
    if (!refund) throw new ClinicError("The refund is larger than the amount still available on this payment.");
    await syncInvoiceBalance(tx, payment.invoiceId);
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'payment.refunded', 'refund', ${refund.id}::uuid, ${JSON.stringify({ paymentId, amount })}::jsonb)
    `);
    return refund.id;
  }, ctx.userId);
}

export async function issueCreditNote(ctx: ClinicContext, invoiceId: string, amountInput: string, reason: string) {
  assertPermission(ctx, "payments.write");
  const amount = moneyText(amountInput, "Credit note amount", false);
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new ClinicError("Enter a reason for the credit note.");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    await tx.execute(sql`select id from invoices where id = ${invoiceId}::uuid and business_id = ${ctx.businessId}::uuid for update`);
    const rows = await queryRows<{ id: string }>(tx, sql`
      insert into credit_notes (business_id, invoice_id, credit_note_number, amount, currency, reason, status, issued_at)
      select business_id, id, 'CN-' || replace(gen_random_uuid()::text, '-', ''), ${amount}::numeric, currency, ${trimmed}, 'issued', now()
      from invoices
      where id = ${invoiceId}::uuid
        and business_id = ${ctx.businessId}::uuid
        and status in ('finalized', 'partially_paid', 'paid')
        and credit_total + ${amount}::numeric <= total
      returning id
    `);
    const note = rows[0];
    if (!note) throw new ClinicError("A credit note can only be issued against a finalized invoice, and the credits cannot exceed the original total.");
    await syncInvoiceBalance(tx, invoiceId);
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'credit_note.issued', 'credit_note', ${note.id}::uuid, ${JSON.stringify({ invoiceId })}::jsonb)
    `);
    return note.id;
  }, ctx.userId);
}

export async function getPayment(ctx: ClinicContext, paymentId: string) {
  assertPermission(ctx, "payments.read");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const rows = await queryRows<Record<string, string | null>>(tx, sql`
      select payments.id, payments.receipt_number, payments.amount::text as amount, payments.method,
             payments.reference, payments.notes, payments.received_at::text as received_at,
             invoices.invoice_number, invoices.balance::text as balance, invoices.currency,
             invoices.issuer_display_name, invoices.issuer_address, invoices.issuer_phone,
             patients.full_name, patients.mobile
      from payments
      join invoices on invoices.id = payments.invoice_id
      join patients on patients.id = invoices.patient_id
      where payments.id = ${paymentId}::uuid and payments.business_id = ${ctx.businessId}::uuid
      limit 1
    `);
    return rows[0] ?? null;
  }, ctx.userId);
}

export async function listPayments(ctx: ClinicContext, page: number, query?: string) {
  assertPermission(ctx, "payments.read");
  const current = Math.max(1, page);
  const pattern = query?.trim() ? `%${query.trim().replace(/[%_]/g, "")}%` : null;
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const rows = await queryRows<Record<string, string>>(tx, sql`
      select payments.id, payments.receipt_number, payments.amount::text as amount, payments.method,
             payments.received_at::text as received_at, invoices.invoice_number, patients.full_name
      from payments
      join invoices on invoices.id = payments.invoice_id
      join patients on patients.id = invoices.patient_id
      where payments.business_id = ${ctx.businessId}::uuid
        and (${pattern}::text is null or payments.receipt_number ilike ${pattern} or invoices.invoice_number ilike ${pattern} or patients.full_name ilike ${pattern})
      order by payments.received_at desc, payments.id desc
      limit ${PAGE_SIZE} offset ${(current - 1) * PAGE_SIZE}
    `);
    const total = Number(await queryValue(tx, sql`
      select count(*)::text as count
      from payments
      join invoices on invoices.id = payments.invoice_id
      join patients on patients.id = invoices.patient_id
      where payments.business_id = ${ctx.businessId}::uuid
        and (${pattern}::text is null or payments.receipt_number ilike ${pattern} or invoices.invoice_number ilike ${pattern} or patients.full_name ilike ${pattern})
    `));
    return { rows, total };
  }, ctx.userId);
}

export async function listCreditNotes(ctx: ClinicContext, invoiceId: string) {
  assertPermission(ctx, "payments.read");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    return tx.select().from(creditNotes).where(and(eq(creditNotes.invoiceId, invoiceId), eq(creditNotes.businessId, ctx.businessId))).orderBy(desc(creditNotes.issuedAt));
  }, ctx.userId);
}
