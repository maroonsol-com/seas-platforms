import { connection } from "next/server";

import { PageSuspense } from "@/components/admin/page-suspense";
import { Pager } from "@/components/admin/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { paymentStatusAction } from "@/server/actions";
import { listPayments } from "@/server/payments";
import { pageNumber } from "@/server/validate";

export const instant = false;

export default function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <PageSuspense>
      <PaymentsContent searchParams={searchParams} />
    </PageSuspense>
  );
}

async function PaymentsContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await connection();
  const page = pageNumber((await searchParams).page);
  const { rows, total } = await listPayments(page);
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">Manual payments only. Recording a payment does not renew a subscription.</p>
        </div>
        <Button render={<Link href="/payments/new" />}>Record payment</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Business</th><th className="p-3">Amount</th><th className="p-3">Date</th><th className="p-3">Method</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {rows.map((payment) => (
              <tr key={payment.id} className="border-b last:border-0">
                <td className="p-3"><Link className="underline" href={`/businesses/${payment.businessId}`}>{payment.businessName}</Link></td>
                <td className="p-3">{payment.currency} {payment.amount}</td>
                <td className="p-3">{payment.paymentDate}</td>
                <td className="p-3">{payment.method}</td>
                <td className="p-3">
                  <Badge variant="secondary">{payment.status}</Badge>
                  <form action={paymentStatusAction} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={payment.id} />
                    <select name="status" defaultValue={payment.status} className="h-8 rounded-lg border px-2 text-xs">
                      <option value="recorded">recorded</option>
                      <option value="received">received</option>
                      <option value="voided">voided</option>
                    </select>
                    <Button size="sm" variant="outline" type="submit">Update</Button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan={5}>No payments recorded.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} path="/payments" />
    </div>
  );
}
