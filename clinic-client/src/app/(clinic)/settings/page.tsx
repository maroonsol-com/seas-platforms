import { connection } from "next/server";

import { BoundForm } from "@/components/clinic/bound-form";
import { LogoField } from "@/components/clinic/logo-field";
import { controlClass } from "@/components/clinic/format";
import { requireBusiness, requireSubscription } from "@/server/access";
import { saveSettingsAction } from "@/server/actions";
import { getSettings } from "@/server/settings";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const params = await searchParams;
  const { settings } = await getSettings(ctx);
  return (
    <div className="grid max-w-xl gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {params.saved ? <p role="status" className="text-sm">Clinic settings were saved.</p> : null}
      <BoundForm action={saveSettingsAction}>
        <input className={controlClass} name="displayName" defaultValue={settings?.displayName ?? ""} placeholder="Display name" required />
        <input className={controlClass} name="legalName" defaultValue={settings?.legalName ?? ""} placeholder="Legal name" required />
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="address" defaultValue={settings?.address ?? ""} placeholder="Address" required />
        <input className={controlClass} name="phone" defaultValue={settings?.phone ?? ""} placeholder="Phone" />
        <input className={controlClass} name="email" defaultValue={settings?.email ?? ""} placeholder="Email" />
        <input className={controlClass} name="gstin" defaultValue={settings?.gstin ?? ""} placeholder="GSTIN, optional" />
        <input className={controlClass} name="invoicePrefix" defaultValue={settings?.invoicePrefix ?? "INV"} placeholder="Invoice prefix" required />
        <input className={controlClass} name="currency" defaultValue={settings?.currency ?? "INR"} placeholder="Currency" required />
        <input className={controlClass} name="defaultDueDays" type="number" min={0} max={365} defaultValue={settings?.defaultDueDays ?? 0} />
        <input className={controlClass} name="brandColor" defaultValue={settings?.brandColor ?? ""} placeholder="Brand color #0F766E" />
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="invoiceFooter" defaultValue={settings?.invoiceFooter ?? ""} placeholder="Invoice footer" />
        <textarea className="min-h-16 rounded-lg border px-3 py-2 text-sm" name="terms" defaultValue={settings?.terms ?? ""} placeholder="Terms and conditions" />
        <LogoField initial={settings?.logoDataUrl ?? ""} />
      </BoundForm>
      <p className="text-sm text-muted-foreground">The logo file is read in the browser and stored with the clinic settings. Issued invoices keep the branding from the day they were finalized.</p>
    </div>
  );
}
