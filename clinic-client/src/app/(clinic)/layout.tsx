import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { ClinicShell } from "@/components/clinic/shell";
import { requirePrincipal } from "@/server/access";

async function ClinicFrame({ children }: { children: ReactNode }) {
  await connection();
  const principal = await requirePrincipal();
  if (!principal.businessId) redirect("/select-business");
  return (
    <ClinicShell name={principal.name} businessName={principal.businessName ?? "Clinic"} subscriptionAllowed={principal.subscriptionAllowed}>
      {children}
    </ClinicShell>
  );
}

export default function ClinicLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading clinic…</p>}>
      <ClinicFrame>{children}</ClinicFrame>
    </Suspense>
  );
}
