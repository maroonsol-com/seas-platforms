import { connection } from "next/server";
import { notFound } from "next/navigation";

import { BoundForm } from "@/components/clinic/bound-form";
import { PrintButton } from "@/components/clinic/print-button";
import { controlClass, money } from "@/components/clinic/format";
import { Button } from "@/components/ui/button";
import { requireBusiness } from "@/server/access";
import { refundPaymentAction } from "@/server/actions";
import { getPayment } from "@/server/payments";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  const { id } = await params;
  const payment = await getPayment(ctx, id);
  if (!payment) notFound();
  return (
    <article className="grid max-w-xl gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Receipt {payment.receipt_number}</h1>
          <p className="text-sm">{payment.issuer_display_name}</p>
          <p className="text-sm text-muted-foreground">{payment.issuer_address}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" render={<a href={`/api/payments/${payment.id}/pdf`} />}>Download PDF</Button>
          <PrintButton />
        </div>
      </div>
      <dl className="grid gap-1 text-sm">
        <div>Invoice {payment.invoice_number}</div>
        <div>Patient {payment.full_name}{payment.mobile ? ` · ${payment.mobile}` : ""}</div>
        <div>Amount {money(payment.amount ?? "0", payment.currency ?? "INR")}</div>
        <div>Method {payment.method}</div>
        {payment.reference ? <div>Reference {payment.reference}</div> : null}
        {payment.notes ? <div>Notes {payment.notes}</div> : null}
        <div>Date {payment.received_at}</div>
        <div>Remaining balance {money(payment.balance ?? "0", payment.currency ?? "INR")}</div>
      </dl>
      {ctx.subscriptionAllowed ? (
        <BoundForm action={refundPaymentAction.bind(null, payment.id ?? "")} submitLabel="Record refund">
          <h2 className="font-semibold">Refund</h2>
          <input className={controlClass} name="amount" placeholder="Amount" required />
          <input className={controlClass} name="reason" placeholder="Reason" required />
        </BoundForm>
      ) : null}
    </article>
  );
}
