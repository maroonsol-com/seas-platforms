import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { TenantAccessError, resolveBusinessAccess } from "../src/server/tenant-access";
import {
  appointments,
  branches,
  businessMemberships,
  businesses,
  consultationAmendments,
  consultations,
  creditNotes,
  doctorLeave,
  doctorProfiles,
  fileMetadata,
  invoiceItems,
  invoices,
  patientMedicalRecords,
  patients,
  payments,
  prescriptions,
  products,
  refunds,
  services,
  stockMovements,
  users,
} from "../src/db/schema/index";
import {
  closeTenantPool,
  withTenantTransaction,
  withUserTransaction,
} from "../src/db/tenant-transaction";

neonConfig.webSocketConstructor = ws;

const root = path.resolve(import.meta.dirname, "../..");
const results: Array<{ name: string; passed: boolean; detail: string }> = [];

function loadEnv(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path.join(root, file), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function applyEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

function record(name: string, passed: boolean, detail = ""): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectFailure(name: string, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
    record(name, false, "operation was allowed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(name, true, message.split("\n")[0]?.slice(0, 160) ?? "rejected");
  }
}

function firstRow<T>(result: T[] | { rows: T[] }): T {
  const rows = Array.isArray(result) ? result : result.rows;
  const row = rows[0];
  if (!row) {
    throw new Error("Expected a database row.");
  }
  return row;
}

function money(value: string | null): string {
  return Number(value ?? "0").toFixed(2);
}

async function main(): Promise<void> {
  const clinicEnv = loadEnv("clinic-client/.env");
  const adminEnv = loadEnv("admin/.env");
  applyEnv(clinicEnv);

  const clinicHttp = neon(clinicEnv.DATABASE_URL);
  const adminHttp = neon(adminEnv.DATABASE_URL);
  const clinicTables = await clinicHttp`select count(*)::int as count from pg_tables where schemaname = 'public'`;
  const adminTables = await adminHttp`select count(*)::int as count from pg_tables where schemaname = 'public'`;
  record("clinic pooled HTTP connectivity", clinicTables[0]?.count === 42, `tables=${clinicTables[0]?.count}`);
  record("admin pooled HTTP connectivity", adminTables[0]?.count === 20, `tables=${adminTables[0]?.count}`);

  const stamp = Date.now().toString(36);
  const businessA = randomUUID();
  const businessB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const doctorUserA = randomUUID();

  await withTenantTransaction(businessA, async (tx) => {
    await tx.insert(businesses).values({
      id: businessA,
      platformBusinessId: randomUUID(),
      legalName: `Verification Clinic A ${stamp}`,
      displayName: `Clinic A ${stamp}`,
    });
    await tx.insert(users).values([
      { id: userA, email: `verify-a-${stamp}@example.test`, name: "Verifier A" },
      { id: doctorUserA, email: `doctor-a-${stamp}@example.test`, name: "Doctor A" },
    ]);
    await tx.insert(businessMemberships).values({
      businessId: businessA,
      userId: userA,
      status: "active",
    });
  });

  await withTenantTransaction(businessB, async (tx) => {
    await tx.insert(businesses).values({
      id: businessB,
      platformBusinessId: randomUUID(),
      legalName: `Verification Clinic B ${stamp}`,
      displayName: `Clinic B ${stamp}`,
    });
    await tx.insert(users).values({
      id: userB,
      email: `verify-b-${stamp}@example.test`,
      name: "Verifier B",
    });
    await tx.insert(businessMemberships).values({
      businessId: businessB,
      userId: userB,
      status: "active",
    });
  });

  const visibleToA = await withUserTransaction(userA, async (tx) => {
    return tx.select({ id: businesses.id }).from(businesses);
  });
  record(
    "membership lists only the authenticated user's businesses",
    visibleToA.length === 1 && visibleToA[0]?.id === businessA,
    `count=${visibleToA.length}`,
  );

  try {
    resolveBusinessAccess({ membershipBusinessId: businessA, browserBusinessId: businessB });
    record("browser business id cannot override membership", false, "browser id was accepted");
  } catch (error) {
    record(
      "browser business id cannot override membership",
      error instanceof TenantAccessError,
    );
  }
  record(
    "access resolves from membership when the browser id matches",
    resolveBusinessAccess({ membershipBusinessId: businessA, browserBusinessId: businessA }) === businessA,
  );

  const seeded = await withTenantTransaction(businessA, async (tx) => {
    const [branch] = await tx.insert(branches).values({
      businessId: businessA,
      name: "Main",
      code: "MAIN",
      addressLine1: "1 Verification Road",
      city: "Pune",
      state: "MH",
      postalCode: "411001",
    }).returning({ id: branches.id });
    const [patient] = await tx.insert(patients).values({
      businessId: businessA,
      patientNumber: `PA-${stamp}`,
      fullName: "Asha Verification",
      mobile: "9000000001",
      email: "asha@example.test",
      dateOfBirth: "1990-01-15",
      gender: "female",
      address: "Pune",
    }).returning({ id: patients.id });
    const [doctor] = await tx.insert(doctorProfiles).values({
      businessId: businessA,
      userId: doctorUserA,
      qualification: "MBBS",
      specialization: "General medicine",
      registrationNumber: `REG-${stamp}`,
    }).returning({ id: doctorProfiles.id });
    const [appointment] = await tx.insert(appointments).values({
      businessId: businessA,
      branchId: branch.id,
      patientId: patient.id,
      doctorId: doctor.id,
      kind: "scheduled",
      startsAt: new Date("2026-12-01T09:00:00Z"),
      endsAt: new Date("2026-12-01T09:30:00Z"),
    }).returning({ id: appointments.id });
    const [product] = await tx.insert(products).values({
      businessId: businessA,
      name: "Paracetamol",
      sku: `PARA-${stamp}`,
      description: "Tablet",
      unit: "strip",
      purchasePrice: "10.00",
      sellingPrice: "100.00",
      taxClassification: "GST",
      taxRate: "18.00",
    }).returning({ id: products.id });
    const [service] = await tx.insert(services).values({
      businessId: businessA,
      name: "Consultation",
      code: `CON-${stamp}`,
      description: "Doctor consultation",
      unit: "visit",
      defaultPrice: "50.00",
      taxClassification: "exempt",
      taxRate: "0.00",
    }).returning({ id: services.id });
    await tx.insert(fileMetadata).values({
      businessId: businessA,
      originalFilename: "report.pdf",
      storageName: "report.pdf",
      mimeType: "application/pdf",
      byteSize: 1200,
      storageKey: `verify/${stamp}/report.pdf`,
    });
    await tx.insert(patientMedicalRecords).values({
      businessId: businessA,
      patientId: patient.id,
      kind: "note",
      title: "Intake",
      details: "Verification note",
    });
    return { branchId: branch.id, patientId: patient.id, doctorId: doctor.id, appointmentId: appointment.id, productId: product.id, serviceId: service.id };
  }, userA);

  const seededB = await withTenantTransaction(businessB, async (tx) => {
    const [branch] = await tx.insert(branches).values({
      businessId: businessB,
      name: "Main",
      code: "MAIN",
      addressLine1: "2 Verification Road",
      city: "Pune",
      state: "MH",
      postalCode: "411002",
    }).returning({ id: branches.id });
    const [patient] = await tx.insert(patients).values({
      businessId: businessB,
      patientNumber: `PB-${stamp}`,
      fullName: "Bina Verification",
      mobile: "9000000002",
    }).returning({ id: patients.id });
    const [product] = await tx.insert(products).values({
      businessId: businessB,
      name: "Secret product",
      sku: `SEC-${stamp}`,
      purchasePrice: "1.00",
      sellingPrice: "2.00",
    }).returning({ id: products.id });
    const doctorUser = randomUUID();
    await tx.insert(users).values({
      id: doctorUser,
      email: `doctor-b-${stamp}@example.test`,
      name: "Doctor B",
    });
    const [doctor] = await tx.insert(doctorProfiles).values({
      businessId: businessB,
      userId: doctorUser,
      qualification: "MBBS",
      specialization: "General medicine",
      registrationNumber: `REGB-${stamp}`,
    }).returning({ id: doctorProfiles.id });
    const [appointment] = await tx.insert(appointments).values({
      businessId: businessB,
      branchId: branch.id,
      patientId: patient.id,
      doctorId: doctor.id,
      kind: "scheduled",
      startsAt: new Date("2026-12-02T09:00:00Z"),
      endsAt: new Date("2026-12-02T09:30:00Z"),
    }).returning({ id: appointments.id });
    const invoiceNumber = firstRow(
      await tx.execute<{ next_invoice_number: string }>(
        sql`select next_invoice_number(${businessB}::uuid)`,
      ),
    );
    const number = invoiceNumber.next_invoice_number;
    const [invoice] = await tx.insert(invoices).values({
      businessId: businessB,
      branchId: branch.id,
      patientId: patient.id,
      invoiceNumber: number,
      invoiceDate: "2026-12-02",
    }).returning({ id: invoices.id });
    await tx.insert(fileMetadata).values({
      businessId: businessB,
      originalFilename: "secret.pdf",
      storageName: "secret.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      storageKey: `verify/${stamp}/secret.pdf`,
    });
    await tx.insert(patientMedicalRecords).values({
      businessId: businessB,
      patientId: patient.id,
      kind: "allergy",
      title: "Private",
      details: "Do not disclose",
    });
    return { patientId: patient.id, productId: product.id, appointmentId: appointment.id, invoiceId: invoice.id };
  }, userB);

  const isolated = await withTenantTransaction(businessA, async (tx) => {
    const ownPatients = await tx.select({ id: patients.id, fullName: patients.fullName }).from(patients);
    const foreignPatients = ownPatients.filter((row) => row.id === seededB.patientId);
    const searched = await tx.select({ id: patients.id }).from(patients).where(sql`
      ${patients.fullName} ilike ${"%Asha%"}
      or ${patients.mobile} = '9000000001'
      or ${patients.patientNumber} = ${`PA-${stamp}`}
    `);
    const ownInvoices = await tx.select({ id: invoices.id }).from(invoices);
    const ownFiles = await tx.select({ id: fileMetadata.id }).from(fileMetadata);
    const ownNotes = await tx.select({ id: patientMedicalRecords.id }).from(patientMedicalRecords);
    const ownProducts = await tx.select({ id: products.id }).from(products);
    const appointmentUpdate = await tx.update(appointments)
      .set({ reason: "cross-tenant attempt" })
      .where(eq(appointments.id, seededB.appointmentId))
      .returning({ id: appointments.id });
    return {
      ownPatients: ownPatients.length,
      sawForeignPatient: foreignPatients.length > 0,
      searchCount: searched.length,
      invoices: ownInvoices.length,
      files: ownFiles.length,
      notes: ownNotes.length,
      products: ownProducts.length,
      appointmentUpdates: appointmentUpdate.length,
    };
  }, userA);

  record("business A reads its own patient", isolated.ownPatients === 1);
  record("patient search finds the saved patient", isolated.searchCount === 1, `matches=${isolated.searchCount}`);
  record("business A cannot read business B patients", !isolated.sawForeignPatient);
  record("business A cannot read business B invoices", isolated.invoices === 0, `visible=${isolated.invoices}`);
  record("business A cannot read business B files", isolated.files === 1, `visible=${isolated.files}`);
  record("business A cannot read business B clinical records", isolated.notes === 1, `visible=${isolated.notes}`);
  record("business A cannot read business B inventory", isolated.products === 1, `visible=${isolated.products}`);
  record("business A cannot update business B appointments", isolated.appointmentUpdates === 0);

  await expectFailure("business A cannot use business B's product", () =>
    withTenantTransaction(businessA, async (tx) => {
      const invoiceNumber = firstRow(
        await tx.execute<{ next_invoice_number: string }>(
          sql`select next_invoice_number(${businessA}::uuid)`,
        ),
      );
      const [invoice] = await tx.insert(invoices).values({
        businessId: businessA,
        branchId: seeded.branchId,
        patientId: seeded.patientId,
        invoiceNumber: invoiceNumber.next_invoice_number,
        invoiceDate: "2026-12-03",
      }).returning({ id: invoices.id });
      await tx.insert(invoiceItems).values({
        businessId: businessA,
        invoiceId: invoice.id,
        productId: seededB.productId,
        kind: "product",
        itemName: "Secret product",
        description: "Should fail",
        unit: "unit",
        quantity: "1.000",
        unitPrice: "2.00",
        taxAmount: "0.00",
        lineTotal: "2.00",
      });
    }),
  );

  const catalogue = await withTenantTransaction(businessA, async (tx) => {
    const foundPatients = await tx.select({ id: patients.id }).from(patients);
    const foundProducts = await tx.select({ id: products.id, name: products.name }).from(products);
    const foundServices = await tx.select({ id: services.id, name: services.name }).from(services);
    return { patients: foundPatients.length, products: foundProducts.length, services: foundServices.length };
  });
  record("saved patient remains listed", catalogue.patients === 1);
  record("saved product appears in the catalogue", catalogue.products === 1);
  record("saved service appears in the catalogue", catalogue.services === 1);

  const invoiceResult = await withTenantTransaction(businessA, async (tx) => {
    const invoiceNumber = firstRow(
      await tx.execute<{ next_invoice_number: string }>(
        sql`select next_invoice_number(${businessA}::uuid)`,
      ),
    );
    const [invoice] = await tx.insert(invoices).values({
      businessId: businessA,
      branchId: seeded.branchId,
      patientId: seeded.patientId,
      invoiceNumber: invoiceNumber.next_invoice_number,
      invoiceDate: "2026-12-01",
    }).returning({ id: invoices.id });
    await tx.insert(invoiceItems).values({
      businessId: businessA,
      invoiceId: invoice.id,
      productId: seeded.productId,
      kind: "product",
      itemName: "Paracetamol",
      itemCode: `PARA-${stamp}`,
      description: "Tablet",
      unit: "strip",
      quantity: "2.000",
      unitPrice: "100.00",
      discount: "10.00",
      taxClassification: "GST",
      taxRate: "18.00",
      taxAmount: "0.00",
      lineTotal: "1.00",
    });
    await tx.insert(invoiceItems).values({
      businessId: businessA,
      invoiceId: invoice.id,
      serviceId: seeded.serviceId,
      kind: "service",
      itemName: "Consultation",
      itemCode: `CON-${stamp}`,
      description: "Doctor consultation",
      unit: "visit",
      quantity: "1.000",
      unitPrice: "50.00",
      taxClassification: "exempt",
      taxRate: "0.00",
      taxAmount: "9.99",
      lineTotal: "9.99",
    });
    const [header] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
    const lines = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    await tx.update(invoices).set({ status: "finalized" }).where(eq(invoices.id, invoice.id));
    const [finalized] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id));
    return { invoiceId: invoice.id, header, lines, finalized };
  });

  const productLine = invoiceResult.lines.find((line) => line.kind === "product");
  const serviceLine = invoiceResult.lines.find((line) => line.kind === "service");
  record("invoice stores two catalogue lines", invoiceResult.lines.length === 2);
  record(
    "database recalculates product line amounts",
    money(productLine?.taxAmount ?? null) === "34.20" && money(productLine?.lineTotal ?? null) === "224.20",
    `tax=${productLine?.taxAmount} total=${productLine?.lineTotal}`,
  );
  record(
    "database recalculates service line amounts",
    money(serviceLine?.taxAmount ?? null) === "0.00" && money(serviceLine?.lineTotal ?? null) === "50.00",
  );
  record(
    "invoice header totals come from the lines",
    money(invoiceResult.header?.total ?? null) === "274.20",
    `total=${invoiceResult.header?.total}`,
  );
  record("finalized invoice keeps the calculated total", money(invoiceResult.finalized?.total ?? null) === "274.20");

  await expectFailure("finalized invoice line cannot be changed", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.update(invoiceItems).set({ unitPrice: "1.00" }).where(eq(invoiceItems.invoiceId, invoiceResult.invoiceId)),
    ),
  );
  await expectFailure("finalized invoice line cannot be deleted", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceResult.invoiceId)),
    ),
  );

  await withTenantTransaction(businessA, (tx) =>
    tx.update(products).set({ sellingPrice: "999.00" }).where(eq(products.id, seeded.productId)),
  );
  const afterPriceChange = await withTenantTransaction(businessA, (tx) =>
    tx.select({ unitPrice: invoiceItems.unitPrice }).from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceResult.invoiceId)),
  );
  record(
    "catalogue price change does not change the issued invoice",
    afterPriceChange.some((line) => money(line.unitPrice) === "100.00"),
  );

  const draft = await withTenantTransaction(businessA, async (tx) => {
    const invoiceNumber = firstRow(
      await tx.execute<{ next_invoice_number: string }>(
        sql`select next_invoice_number(${businessA}::uuid)`,
      ),
    );
    const [invoice] = await tx.insert(invoices).values({
      businessId: businessA,
      branchId: seeded.branchId,
      patientId: seeded.patientId,
      invoiceNumber: invoiceNumber.next_invoice_number,
      invoiceDate: "2026-12-04",
    }).returning({ id: invoices.id });
    const [line] = await tx.insert(invoiceItems).values({
      businessId: businessA,
      invoiceId: invoice.id,
      serviceId: seeded.serviceId,
      kind: "service",
      itemName: "Consultation",
      description: "Draft line",
      unit: "visit",
      quantity: "1.000",
      unitPrice: "50.00",
      taxAmount: "0",
      lineTotal: "0",
    }).returning({ id: invoiceItems.id });
    await tx.update(invoiceItems).set({ quantity: "2.000" }).where(eq(invoiceItems.id, line.id));
    const [updated] = await tx.select({ quantity: invoiceItems.quantity, lineTotal: invoiceItems.lineTotal })
      .from(invoiceItems)
      .where(eq(invoiceItems.id, line.id));
    await tx.delete(invoiceItems).where(eq(invoiceItems.id, line.id));
    return updated;
  });
  record(
    "draft invoice lines can be edited",
    money(draft?.lineTotal ?? null) === "100.00",
    `total=${draft?.lineTotal}`,
  );

  await withTenantTransaction(businessA, async (tx) => {
    await tx.insert(payments).values({
      businessId: businessA,
      invoiceId: invoiceResult.invoiceId,
      receiptNumber: `RCPT-${stamp}`,
      amount: "100.00",
      method: "upi",
      idempotencyKey: `pay-${stamp}`,
      receivedAt: new Date("2026-12-01T10:00:00Z"),
    });
    await tx.update(invoices).set({
      amountPaid: "100.00",
      balance: "174.20",
      status: "partially_paid",
    }).where(eq(invoices.id, invoiceResult.invoiceId));
  });
  const partial = await withTenantTransaction(businessA, (tx) =>
    tx.select({ status: invoices.status, balance: invoices.balance }).from(invoices).where(eq(invoices.id, invoiceResult.invoiceId)),
  );
  record(
    "partial payment updates the issued invoice balance",
    partial[0]?.status === "partially_paid" && money(partial[0]?.balance ?? null) === "174.20",
  );
  await expectFailure("duplicate payment idempotency key is rejected", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.insert(payments).values({
        businessId: businessA,
        invoiceId: invoiceResult.invoiceId,
        receiptNumber: `RCPT2-${stamp}`,
        amount: "10.00",
        method: "cash",
        idempotencyKey: `pay-${stamp}`,
        receivedAt: new Date(),
      }),
    ),
  );

  const [payment] = await withTenantTransaction(businessA, (tx) =>
    tx.select({ id: payments.id }).from(payments).where(eq(payments.idempotencyKey, `pay-${stamp}`)),
  );
  await withTenantTransaction(businessA, async (tx) => {
    await tx.insert(refunds).values({
      businessId: businessA,
      paymentId: payment.id,
      invoiceId: invoiceResult.invoiceId,
      amount: "20.00",
      reason: "Verification refund",
      refundedAt: new Date(),
    });
    await tx.insert(creditNotes).values({
      businessId: businessA,
      invoiceId: invoiceResult.invoiceId,
      creditNoteNumber: `CN-${stamp}`,
      amount: "20.00",
      reason: "Verification credit",
      issuedAt: new Date(),
    });
  });
  record("refund and credit note can be recorded", true);

  await expectFailure("overlapping appointment is rejected", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.insert(appointments).values({
        businessId: businessA,
        branchId: seeded.branchId,
        patientId: seeded.patientId,
        doctorId: seeded.doctorId,
        kind: "scheduled",
        startsAt: new Date("2026-12-01T09:15:00Z"),
        endsAt: new Date("2026-12-01T09:45:00Z"),
      }),
    ),
  );
  await withTenantTransaction(businessA, (tx) =>
    tx.insert(appointments).values({
      businessId: businessA,
      branchId: seeded.branchId,
      patientId: seeded.patientId,
      doctorId: seeded.doctorId,
      kind: "scheduled",
      startsAt: new Date("2026-12-01T10:00:00Z"),
      endsAt: new Date("2026-12-01T10:30:00Z"),
    }),
  );
  record("non-overlapping appointment is accepted", true);

  const consultationId = await withTenantTransaction(businessA, async (tx) => {
    const [consultation] = await tx.insert(consultations).values({
      businessId: businessA,
      branchId: seeded.branchId,
      patientId: seeded.patientId,
      doctorId: seeded.doctorId,
      symptoms: "Draft symptom",
    }).returning({ id: consultations.id });
    await tx.update(consultations).set({ symptoms: "Edited symptom" }).where(eq(consultations.id, consultation.id));
    await tx.update(consultations).set({ status: "finalized", finalizedAt: new Date() }).where(eq(consultations.id, consultation.id));
    return consultation.id;
  });
  await expectFailure("finalized consultation cannot be overwritten", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.update(consultations).set({ symptoms: "Changed after finalization" }).where(eq(consultations.id, consultationId)),
    ),
  );
  await withTenantTransaction(businessA, (tx) =>
    tx.insert(consultationAmendments).values({
      businessId: businessA,
      consultationId,
      reason: "Correction",
      changes: "Symptoms clarified after finalization.",
    }),
  );
  const preserved = await withTenantTransaction(businessA, (tx) =>
    tx.select({ symptoms: consultations.symptoms }).from(consultations).where(eq(consultations.id, consultationId)),
  );
  record("consultation amendment preserves the original note", preserved[0]?.symptoms === "Edited symptom");

  const prescriptionId = await withTenantTransaction(businessA, async (tx) => {
    const [prescription] = await tx.insert(prescriptions).values({
      businessId: businessA,
      consultationId,
      patientId: seeded.patientId,
      doctorId: seeded.doctorId,
      doctorNameSnapshot: "Doctor A",
      qualificationSnapshot: "MBBS",
      registrationSnapshot: `REG-${stamp}`,
    }).returning({ id: prescriptions.id });
    await tx.update(prescriptions).set({ status: "finalized", finalizedAt: new Date() }).where(eq(prescriptions.id, prescription.id));
    return prescription.id;
  });
  await expectFailure("finalized prescription cannot be modified", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.update(prescriptions).set({ notes: "changed" }).where(eq(prescriptions.id, prescriptionId)),
    ),
  );
  await expectFailure("finalized prescription cannot be deleted", () =>
    withTenantTransaction(businessA, (tx) => tx.delete(prescriptions).where(eq(prescriptions.id, prescriptionId))),
  );

  await withTenantTransaction(businessA, (tx) =>
    tx.insert(stockMovements).values([
      { businessId: businessA, productId: seeded.productId, kind: "opening", quantity: "5.000" },
      { businessId: businessA, productId: seeded.productId, kind: "sale", quantity: "-1.000" },
    ]),
  );
  const stock = await withTenantTransaction(businessA, (tx) =>
    tx.select({ quantity: stockMovements.quantity }).from(stockMovements).where(eq(stockMovements.productId, seeded.productId)),
  );
  const onHand = stock.reduce((sum, row) => sum + Number(row.quantity), 0);
  record("stock ledger keeps signed movements", onHand === 4, `onHand=${onHand}`);
  await expectFailure("stock movement cannot be updated", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.update(stockMovements).set({ quantity: "99.000" }).where(eq(stockMovements.productId, seeded.productId)),
    ),
  );
  await expectFailure("stock movement cannot be deleted", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.delete(stockMovements).where(eq(stockMovements.productId, seeded.productId)),
    ),
  );
  await expectFailure("service source cannot create a stock movement", () =>
    withTenantTransaction(businessA, (tx) =>
      tx.insert(stockMovements).values({
        businessId: businessA,
        productId: seeded.productId,
        kind: "adjustment",
        quantity: "1.000",
        sourceType: "service",
      }),
    ),
  );

  const [leave] = await withTenantTransaction(businessA, (tx) =>
    tx.insert(doctorLeave).values({
      businessId: businessA,
      doctorId: seeded.doctorId,
      startsOn: "2026-12-10",
      endsOn: "2026-12-11",
    }).returning({ id: doctorLeave.id }),
  );
  await expectFailure("doctor leave cannot be deleted", () =>
    withTenantTransaction(businessA, (tx) => tx.delete(doctorLeave).where(eq(doctorLeave.id, leave.id))),
  );

  const allocated = await Promise.all([
    withTenantTransaction(businessA, (tx) =>
      tx.execute<{ next_invoice_number: string }>(sql`select next_invoice_number(${businessA}::uuid)`),
    ),
    withTenantTransaction(businessA, (tx) =>
      tx.execute<{ next_invoice_number: string }>(sql`select next_invoice_number(${businessA}::uuid)`),
    ),
  ]);
  const numbers = allocated.map((result) => firstRow(result).next_invoice_number).sort();
  record(
    "concurrent invoice numbers do not collide",
    numbers.length === 2 && numbers[0] !== numbers[1],
    numbers.join(", "),
  );

  const leakPool = new Pool({ connectionString: clinicEnv.DATABASE_URL, max: 1 });
  const client = await leakPool.connect();
  let leaked = -1;
  try {
    await client.query("BEGIN");
    await client.query("set local role clinic_app");
    const seen = await client.query("select count(*)::int as count from patients");
    await client.query("ROLLBACK");
    leaked = seen.rows[0]?.count as number;
  } finally {
    client.release();
    await leakPool.end();
  }
  record("tenant context does not leak onto the next pooled connection", leaked === 0, `visible=${leaked}`);

  const directPool = new Pool({ connectionString: clinicEnv.DATABASE_URL_UNPOOLED, max: 1 });
  const directClient = await directPool.connect();
  try {
    await directClient.query("BEGIN");
    await directClient.query("select set_config('app.current_business_id', $1, true)", [businessA]);
    await directClient.query("set local role clinic_app");
    const own = await directClient.query("select count(*)::int as count from patients");
    await directClient.query("COMMIT");
    await directClient.query("BEGIN");
    await directClient.query("set local role clinic_app");
    const next = await directClient.query("select count(*)::int as count from patients");
    await directClient.query("ROLLBACK");
    record("direct connection sees the current business inside the transaction", own.rows[0]?.count === 1);
    record("direct connection drops tenant context when the transaction ends", next.rows[0]?.count === 0, `visible=${next.rows[0]?.count}`);
  } finally {
    directClient.release();
    await directPool.end();
  }

  await closeTenantPool();
  const failed = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
  const causeMessage = cause instanceof Error ? cause.message : "";
  console.error(
    `${message}\n${causeMessage}`
      .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]")
      .replace(/ep-[a-z0-9-]+/gi, "[redacted-host]"),
  );
  if (error instanceof Error && error.stack) {
    console.error(error.stack.split("\n").slice(0, 12).join("\n"));
  }
  await closeTenantPool().catch(() => undefined);
  process.exit(1);
});
