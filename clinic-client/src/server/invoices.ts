import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { queryRows, queryValue } from "@/db/rows";
import { branches, businessSettings, invoiceItems, invoices, patients, products, services } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";

import { PAGE_SIZE } from "./constants";
import type { ClinicContext } from "./context";
import { assertPermission } from "./context";
import { ClinicError } from "./errors";
import { moneyText, quantityText } from "./money";

export type DraftLine = {
  kind: "product" | "service";
  catalogueId: string;
  quantity: string;
  discount: string;
  description?: string;
};

export type DraftInput = {
  patientId: string;
  branchId: string;
  invoiceDate: string;
  dueDate?: string;
  notes?: string;
  lines: DraftLine[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

function assertDate(value: string, label: string): string {
  if (!DATE.test(value)) throw new ClinicError(`${label} must be a calendar date.`);
  return value;
}

async function replaceLines(tx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0], ctx: ClinicContext, invoiceId: string, lines: DraftLine[]) {
  if (lines.length === 0) throw new ClinicError("Add at least one product or service.");
  await tx.delete(invoiceItems).where(and(eq(invoiceItems.invoiceId, invoiceId), eq(invoiceItems.businessId, ctx.businessId)));
  for (const line of lines) {
    const quantity = quantityText(line.quantity);
    const discount = moneyText(line.discount || "0", "Discount", true);
    if (line.kind === "product") {
      const [product] = await tx.select().from(products).where(and(
        eq(products.id, line.catalogueId),
        eq(products.businessId, ctx.businessId),
        eq(products.status, "active"),
      )).limit(1);
      if (!product) throw new ClinicError("Choose an active product from this clinic.");
      await tx.insert(invoiceItems).values({
        businessId: ctx.businessId,
        invoiceId,
        kind: "product",
        productId: product.id,
        itemName: product.name,
        itemCode: product.sku,
        description: line.description?.trim() || product.description,
        unit: product.unit,
        quantity,
        unitPrice: product.sellingPrice,
        discount,
        taxClassification: product.taxClassification,
        taxRate: product.taxRate ?? "0",
        taxAmount: "0",
        lineTotal: "0",
      });
    } else {
      const [service] = await tx.select().from(services).where(and(
        eq(services.id, line.catalogueId),
        eq(services.businessId, ctx.businessId),
        eq(services.status, "active"),
      )).limit(1);
      if (!service) throw new ClinicError("Choose an active service from this clinic.");
      await tx.insert(invoiceItems).values({
        businessId: ctx.businessId,
        invoiceId,
        kind: "service",
        serviceId: service.id,
        itemName: service.name,
        itemCode: service.code,
        description: line.description?.trim() || service.description,
        unit: service.unit,
        quantity,
        unitPrice: service.defaultPrice,
        discount,
        taxClassification: service.taxClassification,
        taxRate: service.taxRate ?? "0",
        taxAmount: "0",
        lineTotal: "0",
      });
    }
  }
}

async function dueDateFor(tx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0], ctx: ClinicContext, invoiceDate: string, requested?: string) {
  if (requested?.trim()) return assertDate(requested.trim(), "Due date");
  const [settings] = await tx.select({ days: businessSettings.defaultDueDays }).from(businessSettings).where(eq(businessSettings.businessId, ctx.businessId)).limit(1);
  return addDays(invoiceDate, settings?.days ?? 0);
}

export async function invoiceDefaults(ctx: ClinicContext) {
  assertPermission(ctx, "invoices.read");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [settings] = await tx.select().from(businessSettings).where(eq(businessSettings.businessId, ctx.businessId)).limit(1);
    const branchRows = await tx.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.status, "active"));
    return {
      currency: settings?.currency ?? "INR",
      branches: branchRows.filter((branch) => ctx.branchIds.includes(branch.id)),
    };
  }, ctx.userId);
}

export async function saveDraft(ctx: ClinicContext, invoiceId: string | null, input: DraftInput) {
  assertPermission(ctx, "invoices.write");
  if (!ctx.branchIds.includes(input.branchId)) throw new ClinicError("Choose a branch this account can use.");
  const invoiceDate = assertDate(input.invoiceDate, "Invoice date");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [patient] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), eq(patients.businessId, ctx.businessId), eq(patients.isActive, true))).limit(1);
    if (!patient) throw new ClinicError("Choose a patient from this clinic.");
    const dueDate = await dueDateFor(tx, ctx, invoiceDate, input.dueDate);
    let id = invoiceId;
    if (!id) {
      const [created] = await tx.insert(invoices).values({
        businessId: ctx.businessId,
        branchId: input.branchId,
        patientId: input.patientId,
        invoiceNumber: `DRAFT-${randomUUID()}`,
        status: "draft",
        invoiceDate,
        dueDate,
        notes: input.notes?.trim() || null,
        currency: "INR",
      }).returning({ id: invoices.id });
      id = created?.id ?? null;
    } else {
      const [updated] = await tx.update(invoices).set({
        branchId: input.branchId,
        patientId: input.patientId,
        invoiceDate,
        dueDate,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      }).where(and(eq(invoices.id, id), eq(invoices.businessId, ctx.businessId), eq(invoices.status, "draft"))).returning({ id: invoices.id });
      if (!updated) throw new ClinicError("Only a draft invoice can be edited.");
    }
    if (!id) throw new ClinicError("The draft could not be saved.");
    await replaceLines(tx, ctx, id, input.lines);
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'invoice.draft_saved', 'invoice', ${id}::uuid, '{}'::jsonb)
    `);
    return invoice;
  }, ctx.userId);
}

export async function finalizeInvoice(ctx: ClinicContext, invoiceId: string) {
  assertPermission(ctx, "invoices.write");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const itemCount = Number(await queryValue(tx, sql`select count(*)::text as count from invoice_items where invoice_id = ${invoiceId}::uuid`));
    if (itemCount < 1) throw new ClinicError("Add at least one item before finalizing.");
    const rows = await queryRows<{ id: string; invoice_number: string }>(tx, sql`
      update invoices
      set
        status = 'finalized',
        invoice_number = next_invoice_number(invoices.business_id),
        currency = business_settings.currency,
        terms = business_settings.terms,
        issuer_display_name = business_settings.display_name,
        issuer_legal_name = business_settings.legal_name,
        issuer_address = business_settings.address,
        issuer_phone = business_settings.phone,
        issuer_email = business_settings.email,
        issuer_gstin = business_settings.gstin,
        issuer_footer = business_settings.invoice_footer,
        issuer_logo_data_url = business_settings.logo_data_url,
        brand_color = business_settings.brand_color,
        updated_at = now()
      from business_settings
      where invoices.id = ${invoiceId}::uuid
        and invoices.business_id = ${ctx.businessId}::uuid
        and invoices.status = 'draft'
        and business_settings.business_id = invoices.business_id
      returning invoices.id, invoices.invoice_number
    `);
    const finalized = rows[0];
    if (!finalized) throw new ClinicError("This invoice is already finalized or the clinic settings are missing.");
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'invoice.finalized', 'invoice', ${finalized.id}::uuid, ${JSON.stringify({ invoiceNumber: finalized.invoice_number })}::jsonb)
    `);
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, finalized.id)).limit(1);
    return invoice;
  }, ctx.userId);
}

export async function cancelInvoice(ctx: ClinicContext, invoiceId: string, reason: string) {
  assertPermission(ctx, "invoices.write");
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new ClinicError("Enter a reason for the cancellation.");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const rows = await queryRows<{ id: string }>(tx, sql`
      update invoices
      set status = 'cancelled', cancelled_at = now(), cancellation_reason = ${trimmed}, updated_at = now()
      where id = ${invoiceId}::uuid
        and business_id = ${ctx.businessId}::uuid
        and status in ('draft', 'finalized')
        and amount_paid = 0
      returning id
    `);
    if (!rows[0]) throw new ClinicError("Refund recorded payments before cancelling this invoice.");
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'invoice.cancelled', 'invoice', ${invoiceId}::uuid, ${JSON.stringify({ reason: trimmed })}::jsonb)
    `);
    return rows[0].id;
  }, ctx.userId);
}

export async function getInvoice(ctx: ClinicContext, invoiceId: string) {
  assertPermission(ctx, "invoices.read");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, ctx.businessId))).limit(1);
    if (!invoice) return null;
    const [patient] = await tx.select().from(patients).where(eq(patients.id, invoice.patientId)).limit(1);
    const lines = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    const payments = await queryRows<Record<string, unknown>>(tx, sql`
      select id, receipt_number, amount::text, method, reference, notes, status, received_at
      from payments where invoice_id = ${invoice.id}::uuid order by received_at
    `);
    const refunds = await queryRows<Record<string, unknown>>(tx, sql`
      select id, payment_id, amount::text, reason, refunded_at from refunds where invoice_id = ${invoice.id}::uuid order by refunded_at
    `);
    const creditNotes = await queryRows<Record<string, unknown>>(tx, sql`
      select id, credit_note_number, amount::text, reason, status, issued_at from credit_notes where invoice_id = ${invoice.id}::uuid order by issued_at
    `);
    return { invoice, patient: patient ?? null, lines, payments, refunds, creditNotes };
  }, ctx.userId);
}

export async function listInvoices(ctx: ClinicContext, input: {
  page: number;
  query?: string;
  status?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
}) {
  assertPermission(ctx, "invoices.read");
  const page = Math.max(1, input.page);
  const pattern = input.query?.trim() ? `%${input.query.trim().replace(/[%_]/g, "")}%` : null;
  const status = input.status?.trim() || null;
  const from = input.from?.trim() || null;
  const to = input.to?.trim() || null;
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const rows = await queryRows<Record<string, string>>(tx, sql`
      select invoices.id, invoices.invoice_number, invoices.status, invoices.invoice_date::text,
             invoices.due_date::text, invoices.total::text, invoices.amount_paid::text, invoices.balance::text,
             patients.full_name, patients.patient_number, patients.mobile
      from invoices
      join patients on patients.id = invoices.patient_id
      where invoices.business_id = ${ctx.businessId}::uuid
        and (${status}::text is null or invoices.status::text = ${status})
        and (${from}::date is null or invoices.invoice_date >= ${from}::date)
        and (${to}::date is null or invoices.invoice_date <= ${to}::date)
        and (${input.overdue ? true : false} = false or (invoices.due_date < current_date and invoices.balance > 0 and invoices.status in ('finalized', 'partially_paid')))
        and (${pattern}::text is null or invoices.invoice_number ilike ${pattern} or patients.full_name ilike ${pattern} or patients.patient_number ilike ${pattern} or patients.mobile ilike ${pattern})
      order by invoices.invoice_date desc, invoices.created_at desc
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
    `);
    const total = Number(await queryValue(tx, sql`
      select count(*)::text as count
      from invoices
      join patients on patients.id = invoices.patient_id
      where invoices.business_id = ${ctx.businessId}::uuid
        and (${status}::text is null or invoices.status::text = ${status})
        and (${from}::date is null or invoices.invoice_date >= ${from}::date)
        and (${to}::date is null or invoices.invoice_date <= ${to}::date)
        and (${input.overdue ? true : false} = false or (invoices.due_date < current_date and invoices.balance > 0 and invoices.status in ('finalized', 'partially_paid')))
        and (${pattern}::text is null or invoices.invoice_number ilike ${pattern} or patients.full_name ilike ${pattern} or patients.patient_number ilike ${pattern} or patients.mobile ilike ${pattern})
    `));
    return { rows, total };
  }, ctx.userId);
}
