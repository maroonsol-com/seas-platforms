import { connection } from "next/server";

import { PageSuspense } from "@/components/admin/page-suspense";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardMetrics } from "@/server/dashboard";

export const instant = false;

export default function DashboardPage() {
  return (
    <PageSuspense>
      <DashboardContent />
    </PageSuspense>
  );
}

async function DashboardContent() {
  await connection();
  const metrics = await dashboardMetrics();
  const cards = [
    ["Products", metrics.products],
    ["Active products", metrics.activeProducts],
    ["Businesses", metrics.totalBusinesses],
    ["Active businesses", metrics.activeBusinesses],
    ["Expired businesses", metrics.expiredBusinesses],
    ["Suspended businesses", metrics.suspendedBusinesses],
    ["Active subscriptions", metrics.activeSubscriptions],
    ["Expiring within 14 days", metrics.expiringSoon],
  ];

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid gap-3">
          <h2 className="font-semibold">Recent payments</h2>
          {metrics.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments recorded.</p> : (
            <ul className="divide-y rounded-lg border bg-background">
              {metrics.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                  <span>{payment.businessName}</span>
                  <span>{payment.currency} {payment.amount} · {payment.paymentDate}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="grid gap-3">
          <h2 className="font-semibold">Recent platform activity</h2>
          {metrics.activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded.</p> : (
            <ul className="divide-y rounded-lg border bg-background">
              {metrics.activity.map((item) => (
                <li key={item.id} className="px-3 py-2 text-sm">
                  <p>{item.summary}</p>
                  <p className="text-xs text-muted-foreground">{item.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
