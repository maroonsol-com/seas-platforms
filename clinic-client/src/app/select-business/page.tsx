import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requirePrincipal } from "@/server/access";
import { listMemberships } from "@/server/auth";

export default function SelectBusinessPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading clinics…</p>}>
      <BusinessChoices />
    </Suspense>
  );
}

async function BusinessChoices() {
  await connection();
  const principal = await requirePrincipal();
  const choices = await listMemberships(principal.userId);
  if (choices.length === 1 && choices[0]) redirect("/dashboard");

  return (
    <main className="mx-auto grid w-full max-w-lg gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Choose a clinic</h1>
      {choices.length === 0 ? <p className="text-sm text-muted-foreground">This account is not an active member of a clinic.</p> : null}
      {choices.map((choice) => (
        <form key={choice.businessId} action="/api/auth/business" method="post" className="flex items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <div className="font-medium">{choice.displayName}</div>
            <div className="text-sm text-muted-foreground">{choice.legalName}</div>
          </div>
          <input type="hidden" name="businessId" value={choice.businessId} />
          <Button type="submit">Open</Button>
        </form>
      ))}
    </main>
  );
}
