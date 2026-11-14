import "server-only";

import { sessionCookieName } from "@saas/auth-core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminError } from "./errors";
import { readAdministratorSession, type AdminPrincipal } from "./auth";

export async function currentSession(): Promise<AdminPrincipal | null> {
  const store = await cookies();
  return readAdministratorSession(store.get(sessionCookieName("admin"))?.value);
}

export async function requireSession(): Promise<AdminPrincipal> {
  const session = await currentSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requirePermission(permission: string): Promise<AdminPrincipal> {
  const session = await requireSession();
  if (!session.permissions.includes(permission)) {
    throw new AdminError("You do not have permission for this action.");
  }
  return session;
}
