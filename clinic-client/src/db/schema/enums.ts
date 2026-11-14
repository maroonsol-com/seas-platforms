import { pgEnum } from "drizzle-orm/pg-core";

export const clinicBusinessStatusEnum = pgEnum("clinic_business_status", [
  "active",
  "suspended",
  "archived",
]);

export const clinicUserStatusEnum = pgEnum("clinic_user_status", ["active", "disabled"]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "removed",
]);

export const branchStatusEnum = pgEnum("branch_status", ["active", "inactive"]);

export const genderEnum = pgEnum("gender", ["female", "male", "other", "unknown"]);

export const bloodGroupEnum = pgEnum("blood_group", [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "unknown",
]);

export const clinicalRecordKindEnum = pgEnum("clinical_record_kind", [
  "allergy",
  "history",
  "note",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "checked_in",
  "waiting",
  "in_consultation",
  "completed",
  "cancelled",
  "no_show",
]);

export const appointmentKindEnum = pgEnum("appointment_kind", [
  "scheduled",
  "walk_in",
  "follow_up",
]);

export const consultationStatusEnum = pgEnum("consultation_status", ["draft", "finalized"]);

export const prescriptionStatusEnum = pgEnum("prescription_status", ["draft", "finalized"]);

export const catalogStatusEnum = pgEnum("catalog_status", ["active", "inactive"]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "finalized",
  "partially_paid",
  "paid",
  "cancelled",
]);

export const invoiceItemKindEnum = pgEnum("invoice_item_kind", [
  "consultation",
  "service",
  "procedure",
  "product",
]);

export const collectionMethodEnum = pgEnum("collection_method", [
  "cash",
  "upi",
  "card",
  "bank_transfer",
  "other",
]);

export const paymentRecordStatusEnum = pgEnum("payment_record_status", ["recorded", "voided"]);

export const creditNoteStatusEnum = pgEnum("credit_note_status", ["issued", "voided"]);

export const stockMovementKindEnum = pgEnum("stock_movement_kind", [
  "opening",
  "purchase",
  "sale",
  "adjustment",
  "return_in",
  "return_out",
]);

export const purchaseStatusEnum = pgEnum("purchase_status", [
  "draft",
  "ordered",
  "received",
  "cancelled",
]);

export const fileStatusEnum = pgEnum("file_status", ["active", "deleted"]);
