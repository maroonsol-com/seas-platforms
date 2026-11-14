import "server-only";

import { sessionCookieName } from "@saas/auth-core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { ClinicPrincipal } from "./auth";
import { readClinicPrincipal } from "./auth";
import type { ClinicContext } from "./context";

export async function currentPrincipal(): Promise<ClinicPrincipal | null> {
  const token = (await cookies()).get(sessionCookieName("clinic"))?.value;
  if (!token) return null;
  return readClinicPrincipal(token);
}

export async function requirePrincipal(): Promise<ClinicPrincipal> {
  const principal = await currentPrincipal();
  if (!principal) redirect("/login");
  return principal;
}

export async function requireBusiness(): Promise<ClinicContext> {
  const principal = await requirePrincipal();
  if (!principal.businessId) redirect("/select-business");
  return {
    userId: principal.userId,
    businessId: principal.businessId,
    permissions: principal.permissions,
    subscriptionAllowed: principal.subscriptionAllowed,
    timezone: principal.timezone,
    branchIds: principal.branchIds,
  };
}

export function requireSubscription(ctx: ClinicContext): void {
  if (!ctx.subscriptionAllowed) redirect("/subscription");
}
