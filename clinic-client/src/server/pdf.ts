import type { ClinicContext } from "./context";
import { ClinicError } from "./errors";
import { getInvoice } from "./invoices";
import { getPayment } from "./payments";
import { buildPdf, type PdfDocumentInput } from "./pdf-document";

function money(amount: string, currency: string): string {
  return `${currency} ${amount}`;
}

function owed(balance: string): { outstanding: string; customerCredit: string } {
  const value = Number(balance);
  if (!Number.isFinite(value) || value >= 0) return { outstanding: balance, customerCredit: "0.00" };
  return { outstanding: "0.00", customerCredit: Math.abs(value).toFixed(2) };
}

export async function renderPdf(input: PdfDocumentInput): Promise<Uint8Array> {
  return buildPdf(input);
}

export async function invoicePdf(ctx: ClinicContext, invoiceId: string): Promise<{ filename: string; bytes: Uint8Array }> {
  const detail = await getInvoice(ctx, invoiceId);
  if (!detail?.invoice || !detail.patient) throw new ClinicError("That invoice was not found.");
  const invoice = detail.invoice;
  const currency = invoice.currency;
  const settlement = owed(invoice.balance);
  const bytes = await buildPdf({
    title: invoice.issuerDisplayName || "Clinic",
    logoDataUrl: invoice.issuerLogoDataUrl,
    heading: [
      invoice.issuerLegalName || "",
      invoice.issuerAddress || "",
      [invoice.issuerPhone, invoice.issuerEmail].filter(Boolean).join(" · "),
      invoice.issuerGstin ? `GSTIN ${invoice.issuerGstin}` : "",
      `Invoice ${invoice.invoiceNumber}`,
      `Date ${invoice.invoiceDate}${invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}`,
      `Status ${invoice.status}`,
      `Patient ${detail.patient.fullName}`,
      `Patient ID ${detail.patient.patientNumber}${detail.patient.mobile ? ` · ${detail.patient.mobile}` : ""}`,
    ].filter((line) => line.length > 0),
    columns: ["Item", "Qty", "Price", "Discount", "Tax", "Total"],
    columnWidths: [199, 50, 62, 62, 63, 63],
    rows: detail.lines.map((line) => ({
      cells: [
        [line.itemName, line.description].filter(Boolean).join(" — "),
        `${line.quantity} ${line.unit}`,
        money(line.unitPrice, currency),
        money(line.discount, currency),
        money(line.taxAmount, currency),
        money(line.lineTotal, currency),
      ],
    })),
    summary: [
      `Subtotal ${money(invoice.subtotal, currency)}`,
      `Discount ${money(invoice.discountTotal, currency)}`,
      `Tax ${money(invoice.taxTotal, currency)}`,
      `Total ${money(invoice.total, currency)}`,
      `Paid ${money(invoice.amountPaid, currency)}`,
      `Credits ${money(invoice.creditTotal, currency)}`,
      `Outstanding ${money(settlement.outstanding, currency)}`,
      Number(settlement.customerCredit) > 0 ? `Customer credit ${money(settlement.customerCredit, currency)}` : "",
      invoice.notes ? `Notes ${invoice.notes}` : "",
      invoice.terms ? `Terms ${invoice.terms}` : "",
      invoice.issuerFooter || "",
    ].filter((line) => line.length > 0),
  });
  return { filename: `${invoice.invoiceNumber}.pdf`, bytes };
}

export async function receiptPdf(ctx: ClinicContext, paymentId: string): Promise<{ filename: string; bytes: Uint8Array }> {
  const payment = await getPayment(ctx, paymentId);
  if (!payment) throw new ClinicError("That receipt was not found.");
  const settlement = owed(payment.balance ?? "0");
  const bytes = await buildPdf({
    title: `Receipt ${payment.receipt_number}`,
    heading: [
      payment.issuer_display_name || "Clinic",
      payment.issuer_address || "",
      payment.issuer_phone || "",
      `Invoice ${payment.invoice_number}`,
      `Patient ${payment.full_name}`,
      payment.mobile ? `Mobile ${payment.mobile}` : "",
      `Amount ${payment.amount}`,
      `Method ${payment.method}`,
      payment.reference ? `Reference ${payment.reference}` : "",
      payment.notes ? `Notes ${payment.notes}` : "",
      `Date ${payment.received_at}`,
    ].filter((line) => line.length > 0),
    summary: [
      `Outstanding ${settlement.outstanding}`,
      Number(settlement.customerCredit) > 0 ? `Customer credit ${settlement.customerCredit}` : "",
    ].filter((line) => line.length > 0),
  });
  return { filename: `${payment.receipt_number}.pdf`, bytes };
}
