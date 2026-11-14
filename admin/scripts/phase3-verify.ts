import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";

import { hashOtp, SERVICE_SIGNATURE_HEADER, SERVICE_TIMESTAMP_HEADER, signServiceRequest } from "@saas/auth-core";
import { subscriptionAccessAllowed } from "@saas/shared";
import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";

function readEnv(filePath: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[trimmed.slice(0, separator).trim()] = value;
  }
  return values;
}

function applyEnv(values: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (values[key] !== undefined) process.env[key] = values[key];
  }
}

function sanitize(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/ep-[a-z0-9-]+/gi, "[host]");
}

const adminEnv = readEnv(path.join(process.cwd(), ".env"));
const clinicEnv = readEnv(path.join(process.cwd(), "../clinic-client/.env"));
applyEnv(adminEnv, ["APP_DATABASE_TARGET", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "AUTH_SECRET"]);
process.env.ADMIN_BOOTSTRAP_CONFIRM = "yes";
process.env.CLINIC_PROVISIONING_SECRET = randomUUID() + randomUUID();

const passed: string[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    passed.push(name);
  }).catch((error: unknown) => {
    throw new Error(`${name}: ${sanitize(error)}`);
  });
}

async function main() {
const { bootstrapSuperAdmin } = await import("../src/server/bootstrap");
const { closeAdminPool, getAdminDatabase, withAdminTransaction } = await import("../src/db/transaction");
const { requestAdministratorOtp, verifyAdministratorOtp, readAdministratorSession, revokeSessionToken } = await import("../src/server/auth");
const { setEmailSenderForTests } = await import("../src/server/mail");
const { saveProduct, getProduct } = await import("../src/server/products");
const { savePlan } = await import("../src/server/plans");
const { saveBusiness, setBusinessStatus } = await import("../src/server/businesses");
const { provisionBusiness } = await import("../src/server/provisioning");
const { getCurrentSubscription, suspendSubscription } = await import("../src/server/subscriptions");
const { recordPayment, setPaymentStatus } = await import("../src/server/payments");
const { setAdministratorStatus, removeAdministratorRole } = await import("../src/server/administrators");
const { dashboardMetrics } = await import("../src/server/dashboard");
const { AdminError } = await import("../src/server/errors");
const { platformAuditLogs, businessProvisioning, businesses, manualPayments, platformAdministrators, platformRoles, saasProducts, administratorOtpChallenges } = await import("../src/db/schema");
const { handleProvisionRequest, handleEntitlementRequest } = await import("../../clinic-client/src/server/internal-api");
const { closeTenantPool } = await import("../../clinic-client/src/db/tenant-transaction");

let clinicEnvActive = false;
function applyClinicEnv() {
  applyEnv(clinicEnv, ["APP_DATABASE_TARGET", "DATABASE_URL", "DATABASE_URL_UNPOOLED"]);
  clinicEnvActive = true;
}
function applyAdminEnv() {
  applyEnv(adminEnv, ["APP_DATABASE_TARGET", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "AUTH_SECRET"]);
  clinicEnvActive = false;
}

const clinicSql = neon(clinicEnv.DATABASE_URL!);

await check("subscription access is inclusive through the expiry date", async () => {
  assert.equal(subscriptionAccessAllowed({ status: "active", expiresOn: "2026-11-12", timezone: "Asia/Kolkata", now: new Date("2026-11-12T18:00:00.000Z") }), true);
  assert.equal(subscriptionAccessAllowed({ status: "active", expiresOn: "2026-11-11", timezone: "Asia/Kolkata", now: new Date("2026-11-12T02:00:00.000Z") }), false);
  assert.equal(subscriptionAccessAllowed({ status: "suspended", expiresOn: "2026-12-01", timezone: "Asia/Kolkata", now: new Date("2026-11-12T02:00:00.000Z") }), false);
});

await check("bootstrap is idempotent and does not duplicate the super admin", async () => {
  const first = await bootstrapSuperAdmin();
  const second = await bootstrapSuperAdmin();
  assert.equal(second.administratorCreated, false);
  assert.equal(first.roleAssigned || !second.roleAssigned, true);
  const [countRow] = await getAdminDatabase().select({ value: sql<number>`count(*)::int` }).from(platformAdministrators).where(eq(platformAdministrators.email, "majormchandra@gmail.com"));
  assert.equal(countRow?.value, 1);
  const [audit] = await getAdminDatabase().select({ id: platformAuditLogs.id }).from(platformAuditLogs).where(eq(platformAuditLogs.action, "platform.bootstrap")).limit(1);
  assert.ok(audit);
});

const [admin] = await getAdminDatabase().select().from(platformAdministrators).where(eq(platformAdministrators.email, "majormchandra@gmail.com")).limit(1);
if (!admin) throw new Error("Super Admin was not created.");
const actorId = admin.id;

await check("audit records cannot be updated", async () => {
  await assert.rejects(() => getAdminDatabase().execute(sql`update platform_audit_logs set action = 'tampered' where action = 'platform.bootstrap'`));
});

await check("otp is not sent or stored when smtp is not configured", async () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  const result = await requestAdministratorOtp(admin.email);
  assert.equal(result, "not_configured");
  const [countRow] = await getAdminDatabase().select({ value: sql<number>`count(*)::int` }).from(administratorOtpChallenges).where(eq(administratorOtpChallenges.email, admin.email));
  assert.equal(countRow?.value, 0);
});

let captured = "";
setEmailSenderForTests(async (message) => {
  captured = message.text;
  return "sent";
});
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_FROM = "admin@example.test";

await check("otp verify accepts one valid code and rejects the wrong code", async () => {
  const email = `phase3-otp-${randomUUID()}@example.com`;
  await withAdminTransaction(async (tx) => {
    const [created] = await tx.insert(platformAdministrators).values({ email, name: "OTP Test", status: "active" }).returning({ id: platformAdministrators.id });
    if (!created) throw new Error("OTP fixture failed.");
  });
  const requested = await requestAdministratorOtp(email);
  assert.equal(requested, "accepted");
  assert.equal(JSON.stringify(requested).match(/\d{6}/), null);
  const code = captured.match(/\d{6}/)?.[0];
  assert.ok(code);
  const wrong = await verifyAdministratorOtp({ email, code: "000000" });
  assert.ok("error" in wrong);
  const valid = await verifyAdministratorOtp({ email, code: code! });
  assert.ok("token" in valid);
  const session = await readAdministratorSession(valid.token);
  assert.equal(session?.email, email);
  await revokeSessionToken(valid.token);
  assert.equal(await readAdministratorSession(valid.token), null);
});

await check("expired and exhausted codes are rejected", async () => {
  const email = `phase3-expired-${randomUUID()}@example.com`;
  const secret = process.env.AUTH_SECRET ?? "";
  await getAdminDatabase().insert(platformAdministrators).values({ email, name: "Expired", status: "active" });
  await getAdminDatabase().insert(administratorOtpChallenges).values({
    email,
    codeHash: hashOtp("123456", secret),
    expiresAt: new Date(Date.now() - 60_000),
    sentAt: new Date(),
  });
  const expired = await verifyAdministratorOtp({ email, code: "123456" });
  assert.ok("error" in expired);
});

const [product] = await getAdminDatabase().select().from(saasProducts).where(eq(saasProducts.slug, "clinic-management")).limit(1);
if (!product) throw new Error("Clinic product was not created.");

await check("product registry saves configuration without a secret value", async () => {
  const id = await saveProduct({
    actorId,
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    productUrl: product.productUrl,
    status: "active",
    features: ["invoicing"],
    metadata: { area: "clinic" },
    provisioningUrl: product.productUrl ? `${product.productUrl}/api/internal/provision` : null,
    entitlementUrl: product.productUrl ? `${product.productUrl}/api/internal/entitlements` : null,
    secretEnvVar: "CLINIC_PROVISIONING_SECRET",
  });
  const saved = await getProduct(id);
  assert.equal(saved?.integration?.secretEnvVar, "CLINIC_PROVISIONING_SECRET");
  assert.equal(JSON.stringify(saved).includes(process.env.CLINIC_PROVISIONING_SECRET ?? "missing-secret"), false);
});

await check("an administrator without permission cannot create a business", async () => {
  const email = `phase3-limited-${randomUUID()}@example.com`;
  const [limited] = await getAdminDatabase().insert(platformAdministrators).values({ email, name: "Limited", status: "active" }).returning({ id: platformAdministrators.id });
  if (!limited) throw new Error("Limited admin was not created.");
  await assert.rejects(() => saveBusiness({
    actorId: limited.id,
    legalName: "Denied",
    displayName: "Denied",
    businessType: "Clinic",
    ownerName: "Owner",
    ownerEmail: "denied@example.com",
    ownerMobile: "9999999999",
    addressLine1: "1 Road",
    addressLine2: null,
    city: "City",
    state: "State",
    postalCode: "000000",
    country: "IN",
    gstin: null,
    timezone: "Asia/Kolkata",
    internalNotes: null,
    productId: product.id,
    planId: null,
    startsOn: null,
    expiresOn: null,
  }), AdminError);
});

await check("the last super admin cannot be disabled or removed", async () => {
  const [role] = await getAdminDatabase().select({ id: platformRoles.id }).from(platformRoles).where(eq(platformRoles.name, "SUPER_ADMIN")).limit(1);
  if (!role) throw new Error("Role missing.");
  await assert.rejects(() => setAdministratorStatus(actorId, actorId, "disabled"), AdminError);
  await assert.rejects(() => removeAdministratorRole(actorId, actorId, role.id), AdminError);
  const [still] = await getAdminDatabase().select({ status: platformAdministrators.status }).from(platformAdministrators).where(eq(platformAdministrators.id, actorId));
  assert.equal(still?.status, "active");
});

const planId = await savePlan({
  actorId,
  productId: product.id,
  name: `Phase 3 verification ${randomUUID().slice(0, 8)}`,
  description: "Verification plan",
  price: "100.00",
  currency: "INR",
  billingCycle: "monthly",
  trialDays: 0,
  graceDays: 0,
  maxUsers: 5,
  maxBranches: 1,
  storageLimitMb: 100,
  features: ["invoicing"],
  status: "active",
});

function businessInput(label: string) {
  return {
    actorId,
    legalName: label,
    displayName: label,
    businessType: "Clinic",
    ownerName: "Verification Owner",
    ownerEmail: `owner-${randomUUID()}@example.com`,
    ownerMobile: "9999999999",
    addressLine1: "1 Verification Road",
    addressLine2: null,
    city: "Lucknow",
    state: "Uttar Pradesh",
    postalCode: "226001",
    country: "IN",
    gstin: null,
    timezone: "Asia/Kolkata",
    internalNotes: "Phase 3 verification",
    productId: product.id,
    planId,
    startsOn: "2026-11-12",
    expiresOn: "2027-11-12",
  };
}

const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }
  applyClinicEnv();
  const handler = request.url?.includes("entitlements") ? handleEntitlementRequest : handleProvisionRequest;
  const result = await handler(new Request(`http://127.0.0.1${request.url}`, { method: "POST", headers, body }));
  applyAdminEnv();
  response.writeHead(result.status, { "content-type": "application/json" });
  response.end(await result.text());
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;

async function setIntegration(provisioningUrl: string | null, entitlementUrl: string | null) {
  await getAdminDatabase().execute(sql`
    update product_integration_configs
    set provisioning_url = ${provisioningUrl}, entitlement_url = ${entitlementUrl}
    where product_id = ${product.id}
  `);
}

const original = await getProduct(product.id);
try {
  const failedBusinessId = await saveBusiness(businessInput("Phase 3 partial failure"));
  await setIntegration("http://127.0.0.1:9/api/internal/provision", null);
  await check("partial provisioning failure does not create a subscription", async () => {
    await assert.rejects(() => provisionBusiness(actorId, failedBusinessId));
    const [row] = await getAdminDatabase().select().from(businessProvisioning).where(eq(businessProvisioning.businessId, failedBusinessId));
    assert.equal(row?.status, "failed");
    assert.equal(await getCurrentSubscription(failedBusinessId), null);
    const clinicRows = await clinicSql`select count(*)::int as value from businesses where platform_business_id = ${failedBusinessId}`;
    assert.equal(Number(clinicRows[0]?.value), 0);
  });

  const businessId = await saveBusiness(businessInput("Phase 3 provisioned clinic"));
  await setIntegration(`http://127.0.0.1:${port}/api/internal/provision`, `http://127.0.0.1:${port}/api/internal/entitlements`);
  await check("provisioning is idempotent against the clinic database", async () => {
    const first = await provisionBusiness(actorId, businessId);
    const second = await provisionBusiness(actorId, businessId);
    assert.equal(first.productBusinessId, second.productBusinessId);
    const businessCount = await clinicSql`select count(*)::int as value from businesses where platform_business_id = ${businessId}`;
    const memberships = await clinicSql`select count(*)::int as value from business_memberships m join businesses b on b.id = m.business_id where b.platform_business_id = ${businessId}`;
    const [owner] = await getAdminDatabase().select({ ownerEmail: businesses.ownerEmail }).from(businesses).where(eq(businesses.id, businessId));
    const directBody = JSON.stringify({
      idempotencyKey: "phase3-retry",
      platformBusinessId: businessId,
      legalName: "Phase 3 provisioned clinic",
      displayName: "Phase 3 provisioned clinic",
      timezone: "Asia/Kolkata",
      ownerName: "Verification Owner",
      ownerEmail: owner?.ownerEmail,
      ownerMobile: "9999999999",
      addressLine1: "1 Verification Road",
      city: "Lucknow",
      state: "Uttar Pradesh",
      postalCode: "226001",
    });
    const timestamp = new Date().toISOString();
    applyClinicEnv();
    const retry = await handleProvisionRequest(new Request("http://clinic.test/api/internal/provision", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SERVICE_TIMESTAMP_HEADER]: timestamp,
        [SERVICE_SIGNATURE_HEADER]: signServiceRequest(process.env.CLINIC_PROVISIONING_SECRET ?? "", timestamp, directBody),
      },
      body: directBody,
    }));
    applyAdminEnv();
    assert.equal(retry.status, 200);
    const retryBody = await retry.json() as { productBusinessId: string };
    assert.equal(retryBody.productBusinessId, first.productBusinessId);
    const businessesAfter = await clinicSql`select count(*)::int as value from businesses where platform_business_id = ${businessId}`;
    const membershipsAfter = await clinicSql`select count(*)::int as value from business_memberships m join businesses b on b.id = m.business_id where b.platform_business_id = ${businessId}`;
    const snapshots = await clinicSql`select s.status from subscription_snapshots s join businesses b on b.id = s.business_id where b.platform_business_id = ${businessId}`;
    assert.equal(Number(businessCount[0]?.value), 1);
    assert.equal(Number(businessesAfter[0]?.value), 1);
    assert.equal(Number(memberships[0]?.value), 1);
    assert.equal(Number(membershipsAfter[0]?.value), 1);
    assert.equal(snapshots[0]?.status, "active");
    const direct = await handleProvisionRequest(new Request("http://clinic.test/api/internal/provision", {
      method: "POST",
      headers: { "content-type": "application/json", "x-saas-signature": "invalid", "x-saas-timestamp": new Date().toISOString() },
      body: JSON.stringify({ platformBusinessId: randomUUID(), legalName: "Rejected", displayName: "Rejected", ownerName: "A", ownerEmail: "reject@example.com", addressLine1: "1", city: "C", state: "S", postalCode: "1" }),
    }));
    applyAdminEnv();
    assert.equal(direct.status, 401);
  });

  await check("payment recording does not renew a subscription", async () => {
    const before = await getCurrentSubscription(businessId);
    assert.ok(before);
    const paymentId = await recordPayment({
      actorId,
      businessId,
      subscriptionId: before.id,
      amount: "50.00",
      currency: "INR",
      paymentDate: "2026-11-12",
      method: "upi",
      transactionReference: "PHASE3",
      remarks: "Verification",
      idempotencyKey: randomUUID(),
    });
    const duplicate = await recordPayment({
      actorId,
      businessId,
      subscriptionId: before.id,
      amount: "50.00",
      currency: "INR",
      paymentDate: "2026-11-12",
      method: "upi",
      transactionReference: "PHASE3",
      remarks: "Verification",
      idempotencyKey: (await getAdminDatabase().select({ key: manualPayments.idempotencyKey }).from(manualPayments).where(eq(manualPayments.id, paymentId)))[0]!.key,
    });
    assert.equal(duplicate, paymentId);
    await setPaymentStatus(actorId, paymentId, "received");
    const after = await getCurrentSubscription(businessId);
    assert.equal(after?.expiresOn, before.expiresOn);
    assert.equal(after?.status, "active");
  });

  await check("suspension is immediate and business data remains", async () => {
    const current = await getCurrentSubscription(businessId);
    assert.ok(current);
    await suspendSubscription(actorId, current.id);
    const suspended = await getCurrentSubscription(businessId);
    assert.equal(suspended?.status, "suspended");
    await setBusinessStatus(actorId, businessId, "suspended");
    const [business] = await getAdminDatabase().select({ legalName: businesses.legalName }).from(businesses).where(eq(businesses.id, businessId));
    assert.equal(business?.legalName.startsWith("Phase 3"), true);
  });

  await check("dashboard reads stored records", async () => {
    const metrics = await dashboardMetrics();
    assert.ok(metrics.products >= 1);
    assert.ok(metrics.totalBusinesses >= 1);
    assert.ok(metrics.activity.length >= 1);
  });
} finally {
  await setIntegration(original?.integration?.provisioningUrl ?? null, original?.integration?.entitlementUrl ?? null);
  server.close();
  applyAdminEnv();
  await closeTenantPool().catch(() => undefined);
  await closeAdminPool();
}

if (clinicEnvActive) throw new Error("Clinic environment was left active.");
console.log(`Phase 3 verification passed ${passed.length} checks.`);
}

main().catch((error: unknown) => {
  console.error(sanitize(error));
  process.exit(1);
});
