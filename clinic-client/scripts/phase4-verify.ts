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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[trimmed.slice(0, separator).trim()] = value;
  }
}

function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const chunks = [raw.toString("latin1")];
  for (const stream of raw.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const body = Buffer.from(stream[1].replace(/\r?\n$/, ""), "latin1");
    try {
      chunks.push(inflateSync(body).toString("latin1"));
    } catch {
      chunks.push(body.toString("latin1"));
    }
  }
  return chunks.join("\n").replace(/<([0-9A-Fa-f]{2,})>/g, (_match, hex: string) => {
    let text = "";
    for (let index = 0; index + 1 < hex.length; index += 2) {
      text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
    }
    return text;
  });
}

function sanitize(error: unknown): string {
  const cause = error instanceof Error && "cause" in error && error.cause instanceof Error ? ` ${error.cause.message}` : "";
  const message = `${error instanceof Error ? error.message : "Verification failed."}${cause}`;
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").replace(/ep-[a-z0-9-]+/gi, "[redacted]").slice(0, 500);
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const { CLINIC_PERMISSIONS } = await import("../src/server/constants");
  const { createPatient, getPatient, searchPatients, updatePatient } = await import("../src/server/patients");
  const { getProduct, saveProduct, saveService, searchCatalogue, setProductStatus } = await import("../src/server/catalogue");
  const { finalizeInvoice, getInvoice, saveDraft } = await import("../src/server/invoices");
  const { recordPayment, refundPayment } = await import("../src/server/payments");
  const { invoicePdf } = await import("../src/server/pdf");
  const { queryRows, queryValue } = await import("../src/db/rows");
  const { closeTenantPool, withServiceRoleTransaction, withTenantTransaction } = await import("../src/db/tenant-transaction");
  const { ClinicError } = await import("../src/server/errors");

  let passed = 0;
  const failures: string[] = [];
  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed += 1;
    } catch (error) {
      failures.push(`${name}: ${sanitize(error)}`);
    }
  }

  const suffix = randomUUID();
  const platformA = randomUUID();
  const platformB = randomUUID();
  const emailA = `phase4-${suffix}@example.com`;
  const emailB = `phase4-b-${suffix}@example.com`;

  async function provision(platformId: string, email: string) {
    const rows = await withServiceRoleTransaction(async (tx) => queryRows<{ id: string }>(tx, sql`
      select provision_clinic_business(
        ${platformId}::uuid,
        'Phase 4 Clinic',
        'Phase 4 Clinic',
        'Asia/Kolkata',
        'Phase 4 Owner',
        ${email},
        '9000000000',
        '1 Test Road',
        'Pune',
        'MH',
        '411001'
      ) as id
    `));
    const businessId = rows[0]?.id;
    if (!businessId) throw new Error("Provisioning did not return a clinic.");
    const ownerRows = await withServiceRoleTransaction(async (tx) => queryRows<{ id: string }>(tx, sql`
      select id from users where lower(email) = ${email} limit 1
    `));
    const userId = ownerRows[0]?.id;
    if (!userId) throw new Error("Provisioning did not return an owner.");
    const branchRows = await withTenantTransaction(businessId, async (tx) => queryRows<{ id: string }>(tx, sql`
      select id from branches where code = 'MAIN' limit 1
    `), userId);
    const branchId = branchRows[0]?.id;
    if (!branchId) throw new Error("Provisioning did not return a branch.");
    return { businessId, userId, branchId };
  }

  const clinicA = await provision(platformA, emailA);
  const clinicB = await provision(platformB, emailB);
  await withTenantTransaction(clinicA.businessId, async (tx) => {
    await tx.execute(sql`
      insert into subscription_snapshots (business_id, status, plan_name, starts_on, expires_on, timezone)
      values (${clinicA.businessId}::uuid, 'active', 'Verification', '2026-01-01', '2027-12-31', 'Asia/Kolkata')
    `);
  }, clinicA.userId);

  const ctxA = {
    userId: clinicA.userId,
    businessId: clinicA.businessId,
    permissions: [...CLINIC_PERMISSIONS],
    subscriptionAllowed: true,
    timezone: "Asia/Kolkata",
    branchIds: [clinicA.branchId],
  };
  const ctxB = { ...ctxA, userId: clinicB.userId, businessId: clinicB.businessId, branchIds: [clinicB.branchId] };
  const today = "2026-11-12";

  let patientId = "";
  let productId = "";
  let serviceId = "";
  let invoiceId = "";
  let invoiceNumber = "";
  let paymentId = "";

  await check("create patient", async () => {
    const created = await createPatient(ctxA, { fullName: "Asha Rao", mobile: "9811111111", gender: "female", email: "asha@example.com" });
    if (!("patient" in created)) throw new Error("Patient was not created.");
    patientId = created.patient.id;
    if (!created.patient.patientNumber.startsWith("PAT-")) throw new Error("Patient number was not allocated.");
  });

  await check("duplicate patient warning", async () => {
    const duplicate = await createPatient(ctxA, { fullName: "Asha Copy", mobile: "9811111111", gender: "female" });
    if (!("duplicate" in duplicate)) throw new Error("Duplicate mobile was saved without confirmation.");
    const confirmed = await createPatient(ctxA, { fullName: "Asha Copy", mobile: "9811111111", gender: "female", confirmDuplicate: true });
    if (!("patient" in confirmed) || confirmed.patient.id === patientId) throw new Error("Confirmed duplicate was merged or rejected.");
  });

  await check("search and update patient", async () => {
    const found = await searchPatients(ctxA, "Asha");
    if (!found.some((patient) => patient.id === patientId)) throw new Error("Search missed the patient.");
    const updated = await updatePatient(ctxA, patientId, { fullName: "Asha R. Rao", mobile: "9811111111", gender: "female", confirmDuplicate: true });
    if (updated.fullName !== "Asha R. Rao") throw new Error("Patient name was not updated.");
  });

  await check("cross-business patient denial", async () => {
    const hidden = await getPatient(ctxB, patientId);
    if (hidden) throw new Error("Another clinic could read the patient.");
  });

  await check("catalogue create search and stock", async () => {
    const before = await withTenantTransaction(clinicA.businessId, async (tx) => queryValue(tx, sql`select count(*)::text as count from stock_movements`), clinicA.userId);
    const product = await saveProduct(ctxA, null, { name: "Gauze", code: `GZ-${suffix.slice(0, 8)}`, sellingPrice: "100", taxRate: "18", taxClassification: "GST 18" });
    const service = await saveService(ctxA, null, { name: "Dressing", code: `DR-${suffix.slice(0, 8)}`, sellingPrice: "50" });
    productId = product.product.id;
    serviceId = service.id;
    const found = await searchCatalogue(ctxA, "Gauze");
    if (!found.some((item) => item.id === productId && item.kind === "product")) throw new Error("Product search failed.");
    const services = await searchCatalogue(ctxA, "Dressing");
    if (!services.some((item) => item.id === serviceId && item.kind === "service")) throw new Error("Service search failed.");
    const after = await withTenantTransaction(clinicA.businessId, async (tx) => queryValue(tx, sql`select count(*)::text as count from stock_movements`), clinicA.userId);
    if (before !== after) throw new Error("Catalogue changes affected stock.");
  });

  await check("cross-business catalogue denial", async () => {
    if (await getProduct(ctxB, productId)) throw new Error("Another clinic could read the product.");
  });

  await check("draft with products and services", async () => {
    const draft = await saveDraft(ctxA, null, {
      patientId,
      branchId: clinicA.branchId,
      invoiceDate: today,
      lines: [
        { kind: "product", catalogueId: productId, quantity: "2", discount: "10" },
        { kind: "service", catalogueId: serviceId, quantity: "2", discount: "0" },
      ],
    });
    if (!draft || draft.status !== "draft") throw new Error("Draft was not saved.");
    invoiceId = draft.id;
    const edited = await saveDraft(ctxA, invoiceId, {
      patientId,
      branchId: clinicA.branchId,
      invoiceDate: today,
      lines: [
        { kind: "product", catalogueId: productId, quantity: "2", discount: "10" },
        { kind: "service", catalogueId: serviceId, quantity: "1", discount: "0" },
      ],
    });
    if (edited?.id !== invoiceId) throw new Error("Draft edit created another invoice.");
  });

  await check("finalize, snapshot, and duplicate finalization", async () => {
    const finalized = await finalizeInvoice(ctxA, invoiceId);
    if (!finalized || finalized.status === "draft" || !finalized.invoiceNumber.startsWith("INV-")) throw new Error("Invoice was not finalized.");
    invoiceNumber = finalized.invoiceNumber;
    if (finalized.total !== "274.20") throw new Error(`Unexpected total ${finalized.total}.`);
    let duplicate = false;
    try {
      await finalizeInvoice(ctxA, invoiceId);
    } catch (error) {
      duplicate = error instanceof ClinicError;
    }
    if (!duplicate) throw new Error("The invoice was finalized twice.");
    await saveProduct(ctxA, productId, { name: "Gauze", code: `GZ-${suffix.slice(0, 8)}`, sellingPrice: "999", taxRate: "18" });
    const stored = await getInvoice(ctxA, invoiceId);
    const line = stored?.lines.find((item) => item.productId === productId);
    if (line?.unitPrice !== "100.00" && line?.unitPrice !== "100") throw new Error("Catalogue price changed a finalized line.");
  });

  await check("concurrent invoice numbers", async () => {
    const makeInvoice = async () => {
      const draft = await saveDraft(ctxA, null, {
        patientId,
        branchId: clinicA.branchId,
        invoiceDate: today,
        lines: [{ kind: "service", catalogueId: serviceId, quantity: "1", discount: "0" }],
      });
      if (!draft) throw new Error("Concurrent draft failed.");
      const finalized = await finalizeInvoice(ctxA, draft.id);
      return finalized?.invoiceNumber ?? "";
    };
    const [first, second] = await Promise.all([makeInvoice(), makeInvoice()]);
    if (first === second || !first.startsWith("INV-") || !second.startsWith("INV-")) throw new Error("Concurrent numbering collided.");
  });

  await check("payments, idempotency, refund, and overpayment", async () => {
    const key = randomUUID();
    const partial = await recordPayment(ctxA, { invoiceId, amount: "100", date: today, method: "upi", idempotencyKey: key, reference: "UPI1" });
    paymentId = partial.id;
    const repeated = await recordPayment(ctxA, { invoiceId, amount: "100", date: today, method: "upi", idempotencyKey: key });
    if (repeated.id !== paymentId || !repeated.duplicate) throw new Error("The idempotency key created another payment.");
    const second = await recordPayment(ctxA, { invoiceId, amount: "50", date: today, method: "cash", idempotencyKey: randomUUID() });
    if (second.id === paymentId) throw new Error("A second payment reused the first receipt.");
    const midway = await getInvoice(ctxA, invoiceId);
    if (midway?.invoice.amountPaid !== "150.00" && midway?.invoice.amountPaid !== "150") throw new Error("Multiple payments were not added.");
    await refundPayment(ctxA, paymentId, "40", "Returned unused material");
    const afterRefund = await getInvoice(ctxA, invoiceId);
    if (afterRefund?.invoice.amountPaid !== "110.00" && afterRefund?.invoice.amountPaid !== "110") throw new Error("The refund did not reduce the collected amount.");
    let rejected = false;
    try {
      await recordPayment(ctxA, { invoiceId, amount: "1000", date: today, method: "cash", idempotencyKey: randomUUID() });
    } catch (error) {
      rejected = error instanceof ClinicError;
    }
    if (!rejected) throw new Error("An overpayment was accepted.");
    let foreign = false;
    try {
      await recordPayment(ctxB, { invoiceId, amount: "10", date: today, method: "cash", idempotencyKey: randomUUID() });
    } catch (error) {
      foreign = error instanceof ClinicError;
    }
    if (!foreign) throw new Error("Another clinic recorded a payment.");
  });

  await check("invoice pdf authorization and snapshot text", async () => {
    const pdf = await invoicePdf(ctxA, invoiceId);
    const text = pdfText(pdf.bytes);
    const header = Buffer.from(pdf.bytes).subarray(0, 8).toString();
    if (!header.startsWith("%PDF") || !text.includes(invoiceNumber) || !text.includes("274.20") || !text.includes("Asha R. Rao")) {
      throw new Error("The PDF did not render the saved invoice snapshot.");
    }
    let denied = false;
    try {
      await invoicePdf(ctxB, invoiceId);
    } catch (error) {
      denied = error instanceof ClinicError;
    }
    if (!denied) throw new Error("Another clinic downloaded the invoice.");
  });

  await check("deactivated catalogue stays on the invoice", async () => {
    await setProductStatus(ctxA, productId, "inactive");
    const stored = await getInvoice(ctxA, invoiceId);
    if (!stored?.lines.some((line) => line.productId === productId)) throw new Error("Deactivation removed the historical line.");
  });

  await check("otp login without sending mail", async () => {
    process.env.SMTP_HOST ||= "127.0.0.1";
    process.env.SMTP_FROM ||= "clinic-test@example.com";
    const { setEmailSenderForTests } = await import("../src/server/mail");
    const { countChallengesForTests, requestClinicOtp, verifyClinicOtp } = await import("../src/server/auth");
    const unknown = `missing-${suffix}@example.com`;
    if (await requestClinicOtp(unknown) !== "accepted" || await countChallengesForTests(unknown) !== 0) {
      throw new Error("An unknown address stored a sign-in challenge.");
    }
    let code = "";
    setEmailSenderForTests(async (message) => {
      code = message.text.match(/\d{6}/)?.[0] ?? "";
      return "sent";
    });
    const requested = await requestClinicOtp(emailA);
    setEmailSenderForTests(null);
    if (requested !== "accepted" || code.length !== 6) throw new Error("The sign-in code was not issued to the test sender.");
    const verified = await verifyClinicOtp(emailA, code);
    if (!verified?.token) throw new Error("The sign-in code did not create a session.");
    const wrong = await verifyClinicOtp(emailA, "000000");
    if (wrong) throw new Error("A consumed code was accepted again.");
  });

  await closeTenantPool();
  if (failures.length > 0) {
    console.error(failures.filter((line) => line.length > 0).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`Phase 4 verification passed ${passed} checks.`);
}

main().catch((error: unknown) => {
  console.error(sanitize(error));
  process.exit(1);
});
