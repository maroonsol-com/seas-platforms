import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  businessIsolationPolicy,
  createdAtColumn,
  idColumn,
  sameBusinessForeignKey,
  updatedAtColumn,
} from "./common";
import {
  appointmentKindEnum,
  appointmentStatusEnum,
  bloodGroupEnum,
  clinicalRecordKindEnum,
  consultationStatusEnum,
  genderEnum,
  prescriptionStatusEnum,
} from "./enums";
import { branches, businesses, users } from "./tenancy";

export const patients = pgTable("patients", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  patientNumber: text("patient_number").notNull(),
  fullName: text("full_name").notNull(),
  mobile: text("mobile").notNull(),
  email: text("email"),
  dateOfBirth: date("date_of_birth"),
  gender: genderEnum("gender").notNull().default("unknown"),
  address: text("address"),
  bloodGroup: bloodGroupEnum("blood_group").notNull().default("unknown"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("patients_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("patients_business_number_unique").on(table.businessId, table.patientNumber),
  index("patients_business_name_idx").on(table.businessId, table.fullName),
  index("patients_business_mobile_idx").on(table.businessId, table.mobile),
  businessIsolationPolicy("patients", table.businessId),
]).enableRLS();

export const patientMedicalRecords = pgTable("patient_medical_records", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  patientId: uuid("patient_id").notNull(),
  kind: clinicalRecordKindEnum("kind").notNull(),
  title: text("title").notNull(),
  details: text("details").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  index("patient_medical_records_patient_idx").on(table.businessId, table.patientId),
  sameBusinessForeignKey(
    "patient_medical_records_patient_business_fk",
    [table.patientId, table.businessId],
    [patients.id, patients.businessId],
  ),
  businessIsolationPolicy("patient_medical_records", table.businessId),
]).enableRLS();

export const doctorProfiles = pgTable("doctor_profiles", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id"),
  qualification: text("qualification").notNull(),
  specialization: text("specialization").notNull(),
  registrationNumber: text("registration_number").notNull(),
  consultationFee: numeric("consultation_fee", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("doctor_profiles_id_business_unique").on(table.id, table.businessId),
  uniqueIndex("doctor_profiles_business_user_unique").on(table.businessId, table.userId),
  uniqueIndex("doctor_profiles_business_registration_unique").on(table.businessId, table.registrationNumber),
  index("doctor_profiles_business_idx").on(table.businessId),
  sameBusinessForeignKey(
    "doctor_profiles_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  check("doctor_profiles_fee_nonnegative", sql`${table.consultationFee} >= 0`),
  businessIsolationPolicy("doctor_profiles", table.businessId),
]).enableRLS();

export const staffProfiles = pgTable("staff_profiles", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id"),
  jobTitle: text("job_title").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  uniqueIndex("staff_profiles_business_user_unique").on(table.businessId, table.userId),
  index("staff_profiles_business_idx").on(table.businessId),
  sameBusinessForeignKey(
    "staff_profiles_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  businessIsolationPolicy("staff_profiles", table.businessId),
]).enableRLS();

export const doctorSchedules = pgTable("doctor_schedules", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  doctorId: uuid("doctor_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  weekday: smallint("weekday").notNull(),
  startsTime: time("starts_time").notNull(),
  endsTime: time("ends_time").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  index("doctor_schedules_doctor_idx").on(table.businessId, table.doctorId),
  sameBusinessForeignKey(
    "doctor_schedules_doctor_business_fk",
    [table.doctorId, table.businessId],
    [doctorProfiles.id, doctorProfiles.businessId],
  ),
  sameBusinessForeignKey(
    "doctor_schedules_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  check("doctor_schedules_weekday", sql`${table.weekday} BETWEEN 0 AND 6`),
  check("doctor_schedules_time_order", sql`${table.endsTime} > ${table.startsTime}`),
  businessIsolationPolicy("doctor_schedules", table.businessId),
]).enableRLS();

export const doctorLeave = pgTable("doctor_leave", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  doctorId: uuid("doctor_id").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  reason: text("reason"),
  createdAt: createdAtColumn(),
}, (table) => [
  index("doctor_leave_doctor_idx").on(table.businessId, table.doctorId),
  sameBusinessForeignKey(
    "doctor_leave_doctor_business_fk",
    [table.doctorId, table.businessId],
    [doctorProfiles.id, doctorProfiles.businessId],
  ),
  check("doctor_leave_dates", sql`${table.endsOn} >= ${table.startsOn}`),
  businessIsolationPolicy("doctor_leave", table.businessId),
]).enableRLS();

export const appointments = pgTable("appointments", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  doctorId: uuid("doctor_id").notNull(),
  followUpOfAppointmentId: uuid("follow_up_of_appointment_id"),
  kind: appointmentKindEnum("kind").notNull(),
  status: appointmentStatusEnum("status").notNull().default("scheduled"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("appointments_id_business_unique").on(table.id, table.businessId),
  index("appointments_business_start_idx").on(table.businessId, table.startsAt),
  index("appointments_doctor_start_idx").on(table.doctorId, table.startsAt),
  index("appointments_patient_idx").on(table.businessId, table.patientId),
  sameBusinessForeignKey(
    "appointments_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  sameBusinessForeignKey(
    "appointments_patient_business_fk",
    [table.patientId, table.businessId],
    [patients.id, patients.businessId],
  ),
  sameBusinessForeignKey(
    "appointments_doctor_business_fk",
    [table.doctorId, table.businessId],
    [doctorProfiles.id, doctorProfiles.businessId],
  ),
  check("appointments_time_order", sql`${table.endsAt} > ${table.startsAt}`),
  businessIsolationPolicy("appointments", table.businessId),
]).enableRLS();

export const consultations = pgTable("consultations", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  doctorId: uuid("doctor_id").notNull(),
  appointmentId: uuid("appointment_id"),
  status: consultationStatusEnum("status").notNull().default("draft"),
  chiefComplaint: text("chief_complaint"),
  symptoms: text("symptoms"),
  medicalHistory: text("medical_history"),
  examination: text("examination"),
  treatment: text("treatment"),
  notes: text("notes"),
  followUpOn: date("follow_up_on"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalizedBy: uuid("finalized_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("consultations_id_business_unique").on(table.id, table.businessId),
  index("consultations_patient_idx").on(table.businessId, table.patientId),
  index("consultations_doctor_idx").on(table.businessId, table.doctorId),
  sameBusinessForeignKey(
    "consultations_branch_business_fk",
    [table.branchId, table.businessId],
    [branches.id, branches.businessId],
  ),
  sameBusinessForeignKey(
    "consultations_patient_business_fk",
    [table.patientId, table.businessId],
    [patients.id, patients.businessId],
  ),
  sameBusinessForeignKey(
    "consultations_doctor_business_fk",
    [table.doctorId, table.businessId],
    [doctorProfiles.id, doctorProfiles.businessId],
  ),
  sameBusinessForeignKey(
    "consultations_appointment_business_fk",
    [table.appointmentId, table.businessId],
    [appointments.id, appointments.businessId],
  ),
  businessIsolationPolicy("consultations", table.businessId),
]).enableRLS();

export const consultationAmendments = pgTable("consultation_amendments", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  consultationId: uuid("consultation_id").notNull(),
  reason: text("reason").notNull(),
  changes: text("changes").notNull(),
  amendedBy: uuid("amended_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  index("consultation_amendments_consultation_idx").on(table.consultationId),
  sameBusinessForeignKey(
    "consultation_amendments_consultation_business_fk",
    [table.consultationId, table.businessId],
    [consultations.id, consultations.businessId],
  ),
  businessIsolationPolicy("consultation_amendments", table.businessId),
]).enableRLS();

export const vitals = pgTable("vitals", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  patientId: uuid("patient_id").notNull(),
  consultationId: uuid("consultation_id"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  systolicBp: integer("systolic_bp"),
  diastolicBp: integer("diastolic_bp"),
  pulse: integer("pulse"),
  temperatureC: numeric("temperature_c", { precision: 4, scale: 1 }),
  heightCm: numeric("height_cm", { precision: 5, scale: 1 }),
  weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
  spo2: numeric("spo2", { precision: 4, scale: 1 }),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
}, (table) => [
  index("vitals_patient_idx").on(table.businessId, table.patientId),
  sameBusinessForeignKey(
    "vitals_patient_business_fk",
    [table.patientId, table.businessId],
    [patients.id, patients.businessId],
  ),
  sameBusinessForeignKey(
    "vitals_consultation_business_fk",
    [table.consultationId, table.businessId],
    [consultations.id, consultations.businessId],
  ),
  check("vitals_ranges", sql`
    (${table.systolicBp} IS NULL OR ${table.systolicBp} BETWEEN 0 AND 300)
    AND (${table.diastolicBp} IS NULL OR ${table.diastolicBp} BETWEEN 0 AND 200)
    AND (${table.pulse} IS NULL OR ${table.pulse} BETWEEN 0 AND 400)
    AND (${table.temperatureC} IS NULL OR ${table.temperatureC} BETWEEN 25 AND 45)
    AND (${table.heightCm} IS NULL OR ${table.heightCm} BETWEEN 20 AND 300)
    AND (${table.weightKg} IS NULL OR ${table.weightKg} BETWEEN 0 AND 700)
    AND (${table.spo2} IS NULL OR ${table.spo2} BETWEEN 0 AND 100)
  `),
  businessIsolationPolicy("vitals", table.businessId),
]).enableRLS();

export const diagnoses = pgTable("diagnoses", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  consultationId: uuid("consultation_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  label: text("label").notNull(),
  code: text("code"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (table) => [
  index("diagnoses_consultation_idx").on(table.consultationId),
  index("diagnoses_patient_idx").on(table.businessId, table.patientId),
  sameBusinessForeignKey(
    "diagnoses_consultation_business_fk",
    [table.consultationId, table.businessId],
    [consultations.id, consultations.businessId],
  ),
  sameBusinessForeignKey(
    "diagnoses_patient_business_fk",
    [table.patientId, table.businessId],
    [patients.id, patients.businessId],
  ),
  businessIsolationPolicy("diagnoses", table.businessId),
]).enableRLS();

export const prescriptions = pgTable("prescriptions", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  consultationId: uuid("consultation_id").notNull(),
  patientId: uuid("patient_id").notNull(),
  doctorId: uuid("doctor_id").notNull(),
  status: prescriptionStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  doctorNameSnapshot: text("doctor_name_snapshot").notNull(),
  qualificationSnapshot: text("qualification_snapshot").notNull(),
  registrationSnapshot: text("registration_snapshot").notNull(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
}, (table) => [
  unique("prescriptions_id_business_unique").on(table.id, table.businessId),
  index("prescriptions_patient_idx").on(table.businessId, table.patientId),
  sameBusinessForeignKey(
    "prescriptions_consultation_business_fk",
    [table.consultationId, table.businessId],
    [consultations.id, consultations.businessId],
  ),
  sameBusinessForeignKey(
    "prescriptions_patient_business_fk",
    [table.patientId, table.businessId],
    [patients.id, patients.businessId],
  ),
  sameBusinessForeignKey(
    "prescriptions_doctor_business_fk",
    [table.doctorId, table.businessId],
    [doctorProfiles.id, doctorProfiles.businessId],
  ),
  businessIsolationPolicy("prescriptions", table.businessId),
]).enableRLS();

export const prescriptionMedicines = pgTable("prescription_medicines", {
  id: idColumn(),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  prescriptionId: uuid("prescription_id").notNull(),
  medicineName: text("medicine_name").notNull(),
  strength: text("strength"),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  duration: text("duration").notNull(),
  route: text("route").notNull(),
  instructions: text("instructions"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAtColumn(),
}, (table) => [
  index("prescription_medicines_prescription_idx").on(table.prescriptionId, table.sortOrder),
  sameBusinessForeignKey(
    "prescription_medicines_prescription_business_fk",
    [table.prescriptionId, table.businessId],
    [prescriptions.id, prescriptions.businessId],
  ),
  businessIsolationPolicy("prescription_medicines", table.businessId),
]).enableRLS();
