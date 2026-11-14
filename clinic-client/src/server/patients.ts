import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { queryValue } from "@/db/rows";
import { patientMedicalRecords, patients } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";

import { PAGE_SIZE } from "./constants";
import type { ClinicContext } from "./context";
import { assertPermission } from "./context";
import { ClinicError } from "./errors";

export type PatientInput = {
  fullName: string;
  mobile: string;
  email?: string;
  dateOfBirth?: string;
  gender: "female" | "male" | "other" | "unknown";
  address?: string;
  bloodGroup?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  allergies?: string;
  history?: string;
  notes?: string;
  confirmDuplicate?: boolean;
  isActive?: boolean;
};

export type PatientSummary = {
  id: string;
  patientNumber: string;
  fullName: string;
  mobile: string;
  email: string | null;
  dateOfBirth: string | null;
  gender: string;
  address: string | null;
  isActive: boolean;
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

async function sameMobile(tx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0], businessId: string, mobile: string, exceptId?: string) {
  const rows = await tx
    .select({
      id: patients.id,
      patientNumber: patients.patientNumber,
      fullName: patients.fullName,
      mobile: patients.mobile,
      email: patients.email,
      dateOfBirth: patients.dateOfBirth,
      gender: patients.gender,
      address: patients.address,
      isActive: patients.isActive,
    })
    .from(patients)
    .where(and(eq(patients.businessId, businessId), eq(patients.mobile, mobile)))
    .limit(5);
  return rows.filter((row) => row.id !== exceptId);
}

export async function searchPatients(ctx: ClinicContext, query: string): Promise<PatientSummary[]> {
  assertPermission(ctx, "patients.read");
  const term = query.trim();
  if (term.length < 1) return [];
  const pattern = `%${term.replace(/[%_]/g, "")}%`;
  return withTenantTransaction(ctx.businessId, async (tx) => {
    return tx
      .select({
        id: patients.id,
        patientNumber: patients.patientNumber,
        fullName: patients.fullName,
        mobile: patients.mobile,
        email: patients.email,
        dateOfBirth: patients.dateOfBirth,
        gender: patients.gender,
        address: patients.address,
        isActive: patients.isActive,
      })
      .from(patients)
      .where(and(
        eq(patients.businessId, ctx.businessId),
        eq(patients.isActive, true),
        or(ilike(patients.fullName, pattern), ilike(patients.patientNumber, pattern), ilike(patients.mobile, pattern), ilike(patients.email, pattern)),
      ))
      .orderBy(patients.fullName)
      .limit(20);
  }, ctx.userId);
}

export async function listPatients(ctx: ClinicContext, input: { page: number; query?: string; active?: "active" | "inactive" | "all" }): Promise<{ rows: PatientSummary[]; total: number }> {
  assertPermission(ctx, "patients.read");
  const page = Math.max(1, input.page);
  const pattern = input.query?.trim() ? `%${input.query.trim().replace(/[%_]/g, "")}%` : null;
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const filters = [eq(patients.businessId, ctx.businessId)];
    if (input.active === "inactive") filters.push(eq(patients.isActive, false));
    if (input.active !== "all" && input.active !== "inactive") filters.push(eq(patients.isActive, true));
    if (pattern) {
      const search = or(ilike(patients.fullName, pattern), ilike(patients.patientNumber, pattern), ilike(patients.mobile, pattern), ilike(patients.email, pattern));
      if (search) filters.push(search);
    }
    const where = and(...filters);
    const rows = await tx
      .select({
        id: patients.id,
        patientNumber: patients.patientNumber,
        fullName: patients.fullName,
        mobile: patients.mobile,
        email: patients.email,
        dateOfBirth: patients.dateOfBirth,
        gender: patients.gender,
        address: patients.address,
        isActive: patients.isActive,
      })
      .from(patients)
      .where(where)
      .orderBy(desc(patients.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    const [counted] = await tx.select({ value: count() }).from(patients).where(where);
    return { rows, total: counted?.value ?? 0 };
  }, ctx.userId);
}

export async function getPatient(ctx: ClinicContext, patientId: string) {
  assertPermission(ctx, "patients.read");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [patient] = await tx.select().from(patients).where(and(eq(patients.id, patientId), eq(patients.businessId, ctx.businessId))).limit(1);
    if (!patient) return null;
    const records = await tx.select().from(patientMedicalRecords).where(eq(patientMedicalRecords.patientId, patient.id)).orderBy(desc(patientMedicalRecords.recordedAt));
    const invoices = await queryValue(tx, sql`select count(*)::text as count from invoices where patient_id = ${patient.id}::uuid`);
    return { patient, records, invoiceCount: Number(invoices) };
  }, ctx.userId);
}

export async function createPatient(ctx: ClinicContext, input: PatientInput): Promise<{ patient: PatientSummary } | { duplicate: true; matches: PatientSummary[] }> {
  assertPermission(ctx, "patients.write");
  const mobile = input.mobile.trim();
  const fullName = input.fullName.trim();
  if (!fullName || mobile.length < 8) throw new ClinicError("Enter the patient name and mobile number.");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const matches = await sameMobile(tx, ctx.businessId, mobile);
    if (matches.length > 0 && !input.confirmDuplicate) return { duplicate: true as const, matches };
    const patientNumber = await queryValue(tx, sql`select next_patient_number(${ctx.businessId}::uuid) as allocated`);
    const [created] = await tx.insert(patients).values({
      businessId: ctx.businessId,
      patientNumber,
      fullName,
      mobile,
      email: clean(input.email)?.toLowerCase() ?? null,
      dateOfBirth: clean(input.dateOfBirth),
      gender: input.gender,
      address: clean(input.address),
      bloodGroup: input.bloodGroup ?? "unknown",
      emergencyContactName: clean(input.emergencyContactName),
      emergencyContactPhone: clean(input.emergencyContactPhone),
      notes: clean(input.notes),
      isActive: input.isActive ?? true,
    }).returning({
      id: patients.id,
      patientNumber: patients.patientNumber,
      fullName: patients.fullName,
      mobile: patients.mobile,
      email: patients.email,
      dateOfBirth: patients.dateOfBirth,
      gender: patients.gender,
      address: patients.address,
      isActive: patients.isActive,
    });
    if (!created) throw new ClinicError("The patient could not be saved.");
    if (clean(input.allergies)) {
      await tx.insert(patientMedicalRecords).values({
        businessId: ctx.businessId,
        patientId: created.id,
        kind: "allergy",
        title: "Allergies",
        details: clean(input.allergies)!,
        recordedBy: ctx.userId,
      });
    }
    if (clean(input.history)) {
      await tx.insert(patientMedicalRecords).values({
        businessId: ctx.businessId,
        patientId: created.id,
        kind: "history",
        title: "Medical history",
        details: clean(input.history)!,
        recordedBy: ctx.userId,
      });
    }
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'patient.created', 'patient', ${created.id}::uuid, '{}'::jsonb)
    `);
    return { patient: created };
  }, ctx.userId);
}

export async function updatePatient(ctx: ClinicContext, patientId: string, input: PatientInput): Promise<PatientSummary> {
  assertPermission(ctx, "patients.write");
  const mobile = input.mobile.trim();
  const fullName = input.fullName.trim();
  if (!fullName || mobile.length < 8) throw new ClinicError("Enter the patient name and mobile number.");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const matches = await sameMobile(tx, ctx.businessId, mobile, patientId);
    if (matches.length > 0 && !input.confirmDuplicate) {
      throw new ClinicError("Another patient already uses this mobile number. Confirm to keep both records.");
    }
    const [updated] = await tx.update(patients).set({
      fullName,
      mobile,
      email: clean(input.email)?.toLowerCase() ?? null,
      dateOfBirth: clean(input.dateOfBirth),
      gender: input.gender,
      address: clean(input.address),
      bloodGroup: input.bloodGroup ?? "unknown",
      emergencyContactName: clean(input.emergencyContactName),
      emergencyContactPhone: clean(input.emergencyContactPhone),
      notes: clean(input.notes),
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(and(eq(patients.id, patientId), eq(patients.businessId, ctx.businessId))).returning({
      id: patients.id,
      patientNumber: patients.patientNumber,
      fullName: patients.fullName,
      mobile: patients.mobile,
      email: patients.email,
      dateOfBirth: patients.dateOfBirth,
      gender: patients.gender,
      address: patients.address,
      isActive: patients.isActive,
    });
    if (!updated) throw new ClinicError("That patient was not found.");
    if (clean(input.allergies)) {
      await tx.insert(patientMedicalRecords).values({
        businessId: ctx.businessId,
        patientId: updated.id,
        kind: "allergy",
        title: "Allergies",
        details: clean(input.allergies)!,
        recordedBy: ctx.userId,
      });
    }
    if (clean(input.history)) {
      await tx.insert(patientMedicalRecords).values({
        businessId: ctx.businessId,
        patientId: updated.id,
        kind: "history",
        title: "Medical history",
        details: clean(input.history)!,
        recordedBy: ctx.userId,
      });
    }
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'patient.updated', 'patient', ${updated.id}::uuid, '{}'::jsonb)
    `);
    return updated;
  }, ctx.userId);
}
