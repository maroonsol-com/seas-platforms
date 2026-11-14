import { connection } from "next/server";

import { PageSuspense } from "@/components/admin/page-suspense";
import { isSmtpConfigured } from "@/server/mail";

export const instant = false;

export default function SettingsPage() {
  return (
    <PageSuspense>
      <SettingsContent />
    </PageSuspense>
  );
}

async function SettingsContent() {
  await connection();
  const smtp = isSmtpConfigured();
  const clinicUrl = Boolean(process.env.CLINIC_APP_URL?.trim());
  const provisioningSecret = Boolean(process.env.CLINIC_PROVISIONING_SECRET?.trim());

  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ul className="grid gap-2 text-sm">
        <li>SMTP: {smtp ? "configured" : "not configured. Sign-in codes cannot be emailed."}</li>
        <li>Clinic application URL: {clinicUrl ? "configured" : "CLINIC_APP_URL is not set."}</li>
        <li>Clinic provisioning secret: {provisioningSecret ? "configured" : "CLINIC_PROVISIONING_SECRET is not set."}</li>
      </ul>
      <p className="text-sm text-muted-foreground">Secrets stay in the server environment. This page does not show their values. Plan prices are entered under Plans. Invoice screens are the next phase and are not part of this admin app.</p>
    </div>
  );
}
