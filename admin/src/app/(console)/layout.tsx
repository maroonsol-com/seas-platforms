import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";

import { AdminShell } from "@/components/admin/shell";
import { requireSession } from "@/server/access";

export const instant = false;

async function Console({ children }: { children: ReactNode }) {
  await connection();
  const session = await requireSession();
  return <AdminShell name={session.displayName || session.name}>{children}</AdminShell>;
}

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading admin…</p>}>
      <Console>{children}</Console>
    </Suspense>
  );
}
