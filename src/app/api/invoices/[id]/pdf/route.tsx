import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import InvoicePdf from "@/components/InvoicePdf";
import { getMe } from "@/lib/supabase-server";
import { loadInvoiceDoc } from "@/lib/invoice-data";
import { fileNameFor } from "@/lib/invoice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Downloads an invoice as a PDF in the Anweo brand template.
// The database decides who may see the invoice; anyone else gets "not found".
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.status !== "active") return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  const doc = await loadInvoiceDoc(id);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderToBuffer(<InvoicePdf doc={doc} />);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${fileNameFor(doc)}"`,
      "cache-control": "private, no-store",
    },
  });
}
