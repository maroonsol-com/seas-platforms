import { requireBusiness } from "@/server/access";
import { receiptPdf } from "@/server/pdf";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireBusiness();
  const { id } = await context.params;
  const pdf = await receiptPdf(ctx, id);
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdf.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
