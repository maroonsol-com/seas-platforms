import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { InvoiceEditor } from "@/components/clinic/invoice-editor";
import { requireBusiness, requireSubscription } from "@/server/access";
import { getInvoice, invoiceDefaults } from "@/server/invoices";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const { id } = await params;
  const detail = await getInvoice(ctx, id);
  if (!detail?.invoice || !detail.patient) notFound();
  if (detail.invoice.status !== "draft") redirect(`/invoices/${id}`);
  const defaults = await invoiceDefaults(ctx);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Edit draft</h1>
      <InvoiceEditor
        invoiceId={detail.invoice.id}
        branches={defaults.branches}
        currency={detail.invoice.currency}
        invoiceDate={detail.invoice.invoiceDate}
        initial={{
          patient: {
            id: detail.patient.id,
            patientNumber: detail.patient.patientNumber,
            fullName: detail.patient.fullName,
            mobile: detail.patient.mobile,
            email: detail.patient.email,
            dateOfBirth: detail.patient.dateOfBirth,
            gender: detail.patient.gender,
            address: detail.patient.address,
            isActive: detail.patient.isActive,
          },
          branchId: detail.invoice.branchId,
          invoiceDate: detail.invoice.invoiceDate,
          dueDate: detail.invoice.dueDate ?? "",
          notes: detail.invoice.notes ?? "",
          lines: detail.lines.flatMap((line) => {
            const catalogueId = line.productId ?? line.serviceId;
            if (!catalogueId || (line.kind !== "product" && line.kind !== "service")) return [];
            return [{
              kind: line.kind,
              catalogueId,
              name: line.itemName,
              code: line.itemCode ?? "",
              description: line.description,
              unit: line.unit,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              quantity: line.quantity,
              discount: line.discount,
            }];
          }),
          totals: {
            subtotal: detail.invoice.subtotal,
            discount: detail.invoice.discountTotal,
            tax: detail.invoice.taxTotal,
            total: detail.invoice.total,
            paid: detail.invoice.amountPaid,
            balance: detail.invoice.balance,
          },
        }}
      />
    </div>
  );
}
