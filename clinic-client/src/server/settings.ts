import { eq, sql } from "drizzle-orm";

import { branches, businessSettings } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";

import type { ClinicContext } from "./context";
import { assertPermission } from "./context";
import { ClinicError } from "./errors";

export type SettingsInput = {
  displayName: string;
  legalName: string;
  address: string;
  phone?: string;
  email?: string;
  gstin?: string;
  invoicePrefix: string;
  invoiceFooter?: string;
  terms?: string;
  currency: string;
  defaultDueDays: number;
  brandColor?: string;
  logoDataUrl?: string;
};

const LOGO = /^data:image\/(?:png|jpeg);base64,[a-z0-9+/=\s]+$/i;

export async function getSettings(ctx: ClinicContext) {
  assertPermission(ctx, "settings.read");
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const [settings] = await tx.select().from(businessSettings).where(eq(businessSettings.businessId, ctx.businessId)).limit(1);
    const branchRows = await tx.select({ id: branches.id, name: branches.name, code: branches.code }).from(branches).where(eq(branches.status, "active"));
    return { settings: settings ?? null, branches: branchRows.filter((branch) => ctx.branchIds.includes(branch.id)) };
  }, ctx.userId);
}

export async function saveSettings(ctx: ClinicContext, input: SettingsInput) {
  assertPermission(ctx, "settings.write");
  const displayName = input.displayName.trim();
  const legalName = input.legalName.trim();
  const address = input.address.trim();
  const prefix = input.invoicePrefix.trim().toUpperCase();
  const currency = input.currency.trim().toUpperCase();
  const gstin = input.gstin?.trim().toUpperCase() ?? "";
  const color = input.brandColor?.trim() ?? "";
  const logo = input.logoDataUrl?.trim() ?? "";
  if (!displayName || !legalName || !address) throw new ClinicError("Enter the clinic name and address.");
  if (!/^[A-Z0-9]{1,10}$/.test(prefix)) throw new ClinicError("The invoice prefix can use letters and numbers, up to 10 characters.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new ClinicError("Currency must be a 3-letter code. INR is the default.");
  if (gstin && !/^[A-Z0-9]{15}$/.test(gstin)) throw new ClinicError("GSTIN must be 15 characters, or leave it empty.");
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) throw new ClinicError("Brand color must be a hex color such as #0F766E.");
  if (logo && (!LOGO.test(logo) || logo.length > 250_000)) throw new ClinicError("The logo must be a small PNG or JPEG image.");
  if (!Number.isInteger(input.defaultDueDays) || input.defaultDueDays < 0 || input.defaultDueDays > 365) {
    throw new ClinicError("The default due period must be between 0 and 365 days.");
  }
  return withTenantTransaction(ctx.businessId, async (tx) => {
    const values = {
      displayName,
      legalName,
      address,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      gstin: gstin || null,
      invoicePrefix: prefix,
      invoiceFooter: input.invoiceFooter?.trim() || null,
      terms: input.terms?.trim() ?? "",
      currency,
      defaultDueDays: input.defaultDueDays,
      brandColor: color || null,
      logoDataUrl: logo || null,
      updatedAt: new Date(),
    };
    const [saved] = await tx.insert(businessSettings).values({ businessId: ctx.businessId, ...values }).onConflictDoUpdate({
      target: businessSettings.businessId,
      set: values,
    }).returning();
    await tx.execute(sql`
      insert into audit_logs (business_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${ctx.businessId}::uuid, ${ctx.userId}::uuid, 'settings.updated', 'business_settings', ${ctx.businessId}::uuid, '{}'::jsonb)
    `);
    return saved;
  }, ctx.userId);
}
