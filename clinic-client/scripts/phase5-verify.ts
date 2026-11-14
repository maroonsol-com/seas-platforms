import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";

import { sql } from "drizzle-orm";

function loadEnv(file: string) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[trimmed.slice(0, separator).trim()] = value;
  }
}

function sameMoney(actual: string | null | undefined, expected: number): boolean {
  return Number(actual) === expected;
}

function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const chunks = [raw];
  for (const stream of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const body = Buffer.from(stream[1].replace(/\r?\n$/, ""), "latin1");
    try {
      chunks.push(inflateSync(body).toString("latin1"));
    } catch {
      chunks.push("");
    }
  }
  return chunks.join("\n").replace(/<([0-9A-Fa-f]{2,})>/g, (_match, hex: string) => {
    let text = "";
    for (let index = 0; index + 1 < hex.length; index += 2) text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
    return text;
  });
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const { buildPdf } = await import("../src/server/pdf-document");
  const { PDFDocument: Loaded } = await import("pdf-lib");
  const failures: string[] = [];
  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  async function pagesOf(bytes: Uint8Array) {
    return (await Loaded.load(bytes)).getPageCount();
  }

  await check("one item stays on one page", async () => {
    const bytes = await buildPdf({
      title: "Clinic",
      heading: ["Invoice INV-000010", "Patient Asha Rao"],
      columns: ["Item", "Qty", "Price", "Discount", "Tax", "Total"],
      columnWidths: [199, 50, 62, 62, 63, 63],
      rows: [{ cells: ["Dressing", "1 unit", "INR 100.00", "INR 0.00", "INR 0.00", "INR 100.00"] }],
      summary: ["Total INR 100.00", "Outstanding INR 100.00"],
    });
    const count = await pagesOf(bytes);
    if (count !== 1) throw new Error(`Expected 1 page, got ${count}.`);
  });

  await check("fifty items and a long description span pages", async () => {
    const longDescription = `Extended dressing note ${"careful ".repeat(80)}end-of-note`;
    const rows = Array.from({ length: 50 }, (_, index) => ({
      cells: [`Item ${index + 1}${index === 9 ? ` ${longDescription}` : ""}`, "1 unit", "INR 100.00", "INR 0.00", "INR 0.00", "INR 100.00"],
    }));
    const bytes = await buildPdf({
      title: "Clinic",
      heading: ["Invoice INV-000050", "Patient Asha Rao with a long registered name"],
      columns: ["Item", "Qty", "Price", "Discount", "Tax", "Total"],
      columnWidths: [199, 50, 62, 62, 63, 63],
      rows,
      summary: ["Total INR 5000.00", "Outstanding INR 5000.00"],
    });
    const count = await pagesOf(bytes);
    const text = pdfText(bytes);
    if (count < 2) throw new Error(`Expected multiple pages, got ${count}.`);
    if (!text.includes("Item 50") || !text.includes("Total INR 5000.00") || !text.includes("end-of-note") || !text.includes(`Page ${count} of ${count}`)) {
      throw new Error("The later pages did not keep the last item, the long note, or the final total.");
    }
  });

  const { CLINIC_PERMISSIONS } = await import("../src/server/constants");
  const { saveService } = await import("../src/server/catalogue");
  const { finalizeInvoice, getInvoice, saveDraft } = await import("../src/server/invoices");
  const { issueCreditNote, recordPayment, refundPayment } = await import("../src/server/payments");
  const { financeSummary } = await import("../src/server/reports");
  const { queryRows } = await import("../src/db/rows");
  const { closeTenantPool, withServiceRoleTransaction, withTenantTransaction } = await import("../src/db/tenant-transaction");
  const { ClinicError } = await import("../src/server/errors");

  const suffix = randomUUID();
  const email = `phase5-${suffix}@example.com`;
  const businessRows = await withServiceRoleTransaction(async (tx) => queryRows<{ id: string }>(tx, sql`
    select provision_clinic_business(
      ${randomUUID()}::uuid, 'Phase 5 Clinic', 'Phase 5 Clinic', 'Asia/Kolkata', 'Phase 5 Owner', ${email},
      '9000000000', '1 Test Road', 'Pune', 'MH', '411001'
    ) as id
  `));
  const businessId = businessRows[0]?.id;
  if (!businessId) throw new Error("Provisioning did not return a clinic.");
  const ownerRows = await withServiceRoleTransaction(async (tx) => queryRows<{ id: string }>(tx, sql`select id from users where lower(email) = ${email} limit 1`));
  const userId = ownerRows[0]?.id ?? "";
  const branchRows = await withTenantTransaction(businessId, async (tx) => queryRows<{ id: string }>(tx, sql`select id from branches where code = 'MAIN' limit 1`), userId);
  await withTenantTransaction(businessId, async (tx) => {
    await tx.execute(sql`
      insert into subscription_snapshots (business_id, status, plan_name, starts_on, expires_on, timezone)
      values (${businessId}::uuid, 'active', 'Verification', '2026-01-01', '2027-12-31', 'Asia/Kolkata')
    `);
  }, userId);
  const ctx = {
    userId,
    businessId,
    permissions: [...CLINIC_PERMISSIONS],
    subscriptionAllowed: true,
    timezone: "Asia/Kolkata",
    branchIds: [branchRows[0]?.id ?? ""],
  };
  const service = await saveService(ctx, null, { name: "Review", code: `RV-${suffix.slice(0, 8)}`, sellingPrice: "100" });
  const patientModule = await import("../src/server/patients");
  const created = await patientModule.createPatient(ctx, { fullName: "Credit Patient", mobile: "9898989898", gender: "female" });
  if (!("patient" in created)) throw new Error("Patient was not created.");
  const today = "2026-11-12";

  async function makeInvoice() {
    const draft = await saveDraft(ctx, null, {
      patientId: created.patient.id,
      branchId: ctx.branchIds[0] ?? "",
      invoiceDate: today,
      lines: [{ kind: "service", catalogueId: service.id, quantity: "1", discount: "0" }],
    });
    if (!draft) throw new Error("Draft was not saved.");
    const finalized = await finalizeInvoice(ctx, draft.id);
    if (!finalized || !sameMoney(finalized.total, 100)) throw new Error("Invoice total was not 100.");
    return finalized.id;
  }

  await check("credit notes reduce what is owed without changing the original total", async () => {
    const unpaid = await makeInvoice();
    await issueCreditNote(ctx, unpaid, "40", "Partial billing reduction");
    const partial = await getInvoice(ctx, unpaid);
    if (!sameMoney(partial?.invoice.total, 100) || !sameMoney(partial?.invoice.creditTotal, 40) || !sameMoney(partial?.invoice.balance, 60)) {
      throw new Error("A partial credit on an unpaid invoice did not leave the original total unchanged.");
    }
    await issueCreditNote(ctx, unpaid, "60", "Remaining billing reduction");
    const full = await getInvoice(ctx, unpaid);
    if (!sameMoney(full?.invoice.total, 100) || !sameMoney(full?.invoice.balance, 0) || full?.invoice.status === "paid") {
      throw new Error("A full credit was treated as a cash payment or changed the original total.");
    }
    let rejected = false;
    try {
      await issueCreditNote(ctx, unpaid, "1", "Too much");
    } catch (error) {
      rejected = error instanceof ClinicError;
    }
    if (!rejected) throw new Error("Credits were allowed to exceed the original total.");

    const paidId = await makeInvoice();
    await recordPayment(ctx, { invoiceId: paidId, amount: "100", date: today, method: "upi", idempotencyKey: randomUUID() });
    await issueCreditNote(ctx, paidId, "25", "Credited after payment");
    const credited = await getInvoice(ctx, paidId);
    if (!sameMoney(credited?.invoice.total, 100) || !sameMoney(credited?.invoice.amountPaid, 100) || !sameMoney(credited?.invoice.balance, -25)) {
      throw new Error("A credit on a paid invoice changed cash or the original total.");
    }
    const paymentId = String(credited?.payments[0]?.id ?? "");
    await refundPayment(ctx, paymentId, "25", "Cash returned for the credit");
    const settled = await getInvoice(ctx, paidId);
    if (!sameMoney(settled?.invoice.total, 100) || !sameMoney(settled?.invoice.amountPaid, 75) || !sameMoney(settled?.invoice.creditTotal, 25) || !sameMoney(settled?.invoice.balance, 0)) {
      throw new Error("The refund and credit note were double counted.");
    }

    const partialId = await makeInvoice();
    await recordPayment(ctx, { invoiceId: partialId, amount: "30", date: today, method: "cash", idempotencyKey: randomUUID() });
    await issueCreditNote(ctx, partialId, "20", "Partial credit after a partial payment");
    const mixed = await getInvoice(ctx, partialId);
    if (!sameMoney(mixed?.invoice.balance, 50) || !sameMoney(mixed?.invoice.total, 100)) throw new Error("Partial payment and credit did not leave 50 outstanding.");
    let overpay = false;
    try {
      await recordPayment(ctx, { invoiceId: partialId, amount: "60", date: today, method: "cash", idempotencyKey: randomUUID() });
    } catch (error) {
      overpay = error instanceof ClinicError;
    }
    if (!overpay) throw new Error("A payment larger than the credited balance was accepted.");

    const summary = await financeSummary(ctx);
    if (!sameMoney(summary.outstanding, 50) || !sameMoney(summary.creditNotes, 145) || !sameMoney(summary.refunds, 25) || !sameMoney(summary.collected, 130)) {
      throw new Error("The report mixed credits, refunds, and receivables.");
    }
  });

  await closeTenantPool();
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Phase 5 verification passed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Verification failed.";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  process.exit(1);
});
