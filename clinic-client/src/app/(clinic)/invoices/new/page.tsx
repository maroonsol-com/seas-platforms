import { connection } from "next/server";

import { InvoiceEditor } from "@/components/clinic/invoice-editor";
import { requireBusiness, requireSubscription } from "@/server/access";
import { invoiceDefaults } from "@/server/invoices";
import { localDateIso } from "@saas/shared";

export default async function NewInvoicePage() {
  await connection();
  const ctx = await requireBusiness();
  requireSubscription(ctx);
  const defaults = await invoiceDefaults(ctx);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Create invoice</h1>
      <InvoiceEditor branches={defaults.branches} currency={defaults.currency} invoiceDate={localDateIso(ctx.timezone)} />
    </div>
  );
}
