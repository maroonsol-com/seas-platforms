import { Suspense, type ReactNode } from "react";

export function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>{children}</Suspense>;
}
