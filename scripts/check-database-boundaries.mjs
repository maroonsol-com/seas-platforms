import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function readSql(directory) {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`${directory} has no SQL migrations.`);
  }

  return {
    files,
    sql: files
      .map((name) => readFileSync(path.join(directory, name), "utf8"))
      .join("\n"),
  };
}

function assertAbsent(sql, label, patterns) {
  for (const pattern of patterns) {
    if (sql.includes(pattern)) {
      throw new Error(`${label} contains forbidden text: ${pattern}`);
    }
  }
}

function assertPresent(sql, label, pattern) {
  if (!sql.includes(pattern)) {
    throw new Error(`${label} is missing required text: ${pattern}`);
  }
}

const admin = readSql(path.join(root, "admin/drizzle"));
const clinic = readSql(path.join(root, "clinic-client/drizzle"));

const secrets = [
  "USER:PASSWORD",
  "PLACEHOLDER",
  "ep-ADMIN-HOST",
  "ep-CLINIC-HOST",
  "REPLACE_ME",
  "neon.tech",
  "127.0.0.1",
  "offline:offline",
];

assertAbsent(admin.sql, "Admin SQL", secrets);
assertAbsent(clinic.sql, "Clinic SQL", secrets);
assertAbsent(admin.sql, "Admin SQL", ["double precision", " real "]);
assertAbsent(clinic.sql, "Clinic SQL", ["double precision", " real "]);

for (const table of [
  "patients",
  "consultations",
  "prescriptions",
  "invoices",
  "appointments",
]) {
  assertAbsent(admin.sql, "Admin SQL", [`CREATE TABLE "${table}"`]);
}

for (const table of [
  "platform_administrators",
  "saas_products",
  "subscription_plans",
  "manual_payments",
]) {
  assertAbsent(clinic.sql, "Clinic SQL", [`CREATE TABLE "${table}"`]);
}

assertPresent(admin.sql, "Admin SQL", "numeric(14, 2)");
assertPresent(admin.sql, "Admin SQL", "business_subscriptions_one_open");
assertPresent(clinic.sql, "Clinic SQL", "numeric(14, 2)");
assertPresent(clinic.sql, "Clinic SQL", "FORCE ROW LEVEL SECURITY");
assertPresent(clinic.sql, "Clinic SQL", "businesses_member_visibility");
assertPresent(clinic.sql, "Clinic SQL", "appointments_doctor_no_overlap");
assertPresent(clinic.sql, "Clinic SQL", "current_setting('app.current_business_id', true)");
assertAbsent(clinic.sql, "Clinic SQL", ["set_config"]);

assertPresent(clinic.sql, "Clinic SQL", "item_name");
assertPresent(clinic.sql, "Clinic SQL", "next_invoice_number");
assertPresent(clinic.sql, "Clinic SQL", "invoice_sequences");

assertPresent(clinic.sql, "Clinic SQL", "provision_clinic_business");

const forceCount = clinic.sql
  .split("\n")
  .filter((line) => line.includes("ALTER TABLE") && line.includes("FORCE ROW LEVEL SECURITY"))
  .length;
const enableCount = clinic.sql.split("ENABLE ROW LEVEL SECURITY").length - 1;
if (forceCount !== 43 || enableCount !== 43) {
  throw new Error(
    `Expected 43 row level security tables, found ${enableCount} enabled and ${forceCount} forced.`,
  );
}

if (admin.sql.includes("ENABLE ROW LEVEL SECURITY")) {
  throw new Error("Admin SQL unexpectedly enables row level security.");
}

if (clinic.sql.includes('ALTER TABLE "users" ENABLE ROW LEVEL SECURITY')) {
  throw new Error("Clinic users must stay outside row level security.");
}

if (clinic.sql.includes('ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY')) {
  throw new Error("Clinic permissions must stay outside row level security.");
}

console.log(
  `Database boundary check passed. Admin files: ${admin.files.join(", ")}. Clinic files: ${clinic.files.join(", ")}.`,
);
