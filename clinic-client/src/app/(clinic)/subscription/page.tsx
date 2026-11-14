import { connection } from "next/server";

import { requireBusiness } from "@/server/access";
import { subscriptionNotice } from "@/server/reports";

export default async function SubscriptionPage() {
  await connection();
  const ctx = await requireBusiness();
  const snapshot = await subscriptionNotice(ctx);
  return (
    <div className="grid max-w-xl gap-3">
      <h1 className="text-2xl font-semibold">Subscription</h1>
      {ctx.subscriptionAllowed ? <p>This clinic subscription is active through {snapshot?.expiresOn}.</p> : <p>Normal clinic changes are paused. Issued invoices and receipts remain available. Ask the platform administrator to renew or reactivate the subscription.</p>}
      {snapshot ? <p className="text-sm text-muted-foreground">{snapshot.planName} · {snapshot.status} · {snapshot.startsOn} to {snapshot.expiresOn}</p> : <p className="text-sm text-muted-foreground">No subscription has been recorded for this clinic yet.</p>}
    </div>
  );
}
