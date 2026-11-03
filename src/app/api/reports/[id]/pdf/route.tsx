import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import ReportPdf from "@/components/ReportPdf";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { loadReport } from "@/lib/report-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// A client's monthly report as a branded PDF. Staff can open any client's; a client only their own (the database decides).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.status !== "active") return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const r = await loadReport(id, month);
  if (!r) return new NextResponse("Not found", { status: 404 });
  const sb = await supabaseServer();
  const { data: co } = await sb.from("company_settings").select("legal_name").eq("id", 1).maybeSingle();
  const pdf = await renderToBuffer(<ReportPdf r={r} company={co?.legal_name ?? "Anweo"} />);
  const name = `${r.client.name.replace(/[^\w]+/g, "-")}-${month}-report.pdf`;
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`, "cache-control": "private, no-store" } });
}
