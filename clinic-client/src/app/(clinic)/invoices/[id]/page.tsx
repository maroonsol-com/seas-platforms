import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoundForm } from "@/components/clinic/bound-form";
import { PrintButton } from "@/components/clinic/print-button";
import { controlClass, money } from "@/components/clinic/format";
import { Button } from "@/components/ui/button";
import { requireBusiness } from "@/server/access";
import { cancelInvoiceAction, creditNoteAction, recordPaymentAction } from "@/server/actions";
import { getInvoice } from "@/server/invoices";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  const { id } = await params;
  const detail = await getInvoice(ctx, id);
  if (!detail?.invoice || !detail.patient) notFound();
  const invoice = detail.invoice;
  const canChange = ctx.subscriptionAllowed && invoice.status !== "cancelled";

  return (
    <article className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:block">
        <div>
          <h1 className="text-2xl font-semibold">{invoice.issuerDisplayName || "Invoice"} {invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">{invoice.issuerAddress}</p>
          {invoice.issuerGstin ? <p className="text-sm">GSTIN {invoice.issuerGstin}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {invoice.status === "draft" && canChange ? <Button render={<Link href={`/invoices/${invoice.id}/edit`} />}>Edit draft</Button> : null}
          <Button variant="outline" render={<a href={`/api/invoices/${invoice.id}/pdf`} />}>Download PDF</Button>
          <PrintButton />
        </div>
      </div>
      <section className="grid gap-1 text-sm">
        <div>Patient: {detail.patient.fullName} · {detail.patient.patientNumber} · {detail.patient.mobile}</div>
        <div>Date: {invoice.invoiceDate}{invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}</div>
        <div>Status: {invoice.status}</div>
      </section>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left"><tr><th className="p-3">Item</th><th className="p-3">Qty</th><th className="p-3">Price</th><th className="p-3">Discount</th><th className="p-3">Tax</th><th className="p-3">Total</th></tr></thead>
          <tbody>
            {detail.lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="p-3">{line.itemName}<div className="text-xs text-muted-foreground">{line.kind}{line.itemCode ? ` · ${line.itemCode}` : ""} · {line.description}</div></td>
                <td className="p-3">{line.quantity} {line.unit}</td>
                <td className="p-3">{money(line.unitPrice, invoice.currency)}</td>
                <td className="p-3">{money(line.discount, invoice.currency)}</td>
                <td className="p-3">{line.taxRate}% · {money(line.taxAmount, invoice.currency)}</td>
                <td className="p-3">{money(line.lineTotal, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid max-w-sm gap-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(invoice.subtotal, invoice.currency)}</dd></div>
        <div className="flex justify-between"><dt>Discount</dt><dd>{money(invoice.discountTotal, invoice.currency)}</dd></div>
        <div className="flex justify-between"><dt>Tax</dt><dd>{money(invoice.taxTotal, invoice.currency)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{money(invoice.total, invoice.currency)}</dd></div>
        <div className="flex justify-between"><dt>Paid</dt><dd>{money(invoice.amountPaid, invoice.currency)}</dd></div>
        <div className="flex justify-between"><dt>Credits</dt><dd>{money(invoice.creditTotal, invoice.currency)}</dd></div>
        <div className="flex justify-between"><dt>Outstanding</dt><dd>{money(Number(invoice.balance) > 0 ? invoice.balance : "0", invoice.currency)}</dd></div>
        {Number(invoice.balance) < 0 ? <div className="flex justify-between"><dt>Customer credit</dt><dd>{money(Math.abs(Number(invoice.balance)).toFixed(2), invoice.currency)}</dd></div> : null}
      </dl>
      {invoice.notes ? <p className="text-sm">Notes: {invoice.notes}</p> : null}
      {invoice.terms ? <p className="text-sm">Terms: {invoice.terms}</p> : null}
      {invoice.issuerFooter ? <p className="text-sm">{invoice.issuerFooter}</p> : null}

      <section className="print:hidden">
        <h2 className="font-semibold">Payments</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {detail.payments.map((payment) => <li key={String(payment.id)}><Link className="underline" href={`/payments/${String(payment.id)}`}>{String(payment.receipt_number)}</Link> · {money(String(payment.amount), invoice.currency)} · {String(payment.method)}</li>)}
          {detail.payments.length === 0 ? <li className="text-muted-foreground">No payments yet.</li> : null}
        </ul>
        {detail.refunds.length > 0 ? <ul className="mt-2 text-sm">{detail.refunds.map((refund) => <li key={String(refund.id)}>Refund {money(String(refund.amount), invoice.currency)} · {String(refund.reason)}</li>)}</ul> : null}
        {detail.creditNotes.length > 0 ? <ul className="mt-2 text-sm">{detail.creditNotes.map((note) => <li key={String(note.id)}>{String(note.credit_note_number)} · {money(String(note.amount), invoice.currency)} · {String(note.reason)}</li>)}</ul> : null}
      </section>

      {canChange && invoice.status !== "draft" && Number(invoice.balance) > 0 ? (
        <BoundForm action={recordPaymentAction.bind(null, invoice.id)} submitLabel="Record payment">
          <h2 className="font-semibold">Record payment</h2>
          <input className={controlClass} name="amount" placeholder="Amount" required />
          <input className={controlClass} type="date" name="date" required />
          <select className={controlClass} name="method" defaultValue="upi">
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
          <input className={controlClass} name="reference" placeholder="Transaction reference" />
          <input className={controlClass} name="notes" placeholder="Notes" />
        </BoundForm>
      ) : null}
      {canChange && (invoice.status === "draft" || invoice.status === "finalized") && Number(invoice.amountPaid) === 0 ? (
        <BoundForm action={cancelInvoiceAction.bind(null, invoice.id)} submitLabel="Cancel invoice">
          <h2 className="font-semibold">Cancel</h2>
          <input className={controlClass} name="reason" placeholder="Reason" required />
        </BoundForm>
      ) : null}
      {canChange && invoice.status !== "draft" ? (
        <BoundForm action={creditNoteAction.bind(null, invoice.id)} submitLabel="Issue credit note">
          <h2 className="font-semibold">Credit note</h2>
          <p className="text-sm text-muted-foreground">A credit note reduces what is still owed. It does not change the original invoice total and it does not return cash. Record a refund when money goes back to the patient. Credits cannot add up to more than the original total.</p>
          <input className={controlClass} name="amount" placeholder="Amount" required />
          <input className={controlClass} name="reason" placeholder="Reason" required />
        </BoundForm>
      ) : null}
    </article>
  );
}
