import { NextResponse } from "next/server";
import { getMe } from "@/lib/supabase-server";
import { loadTransactions, kindLabel } from "@/lib/transactions";

export const dynamic = "force-dynamic";

const cell = (v: string | number) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Admin-only CSV of the transactions matching the page's filters.
export async function GET(req: Request) {
  const me = await getMe();
  if (!me || me.status !== "active" || me.role !== "admin") return new NextResponse("Not found", { status: 404 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await loadTransactions(sp);
  const head = ["Date", "Type", "Who / client", "Description", "Amount", "Currency", "Status", "Note"];
  const lines = [head.join(",")].concat(rows.map((r) => [r.date, kindLabel[r.kind], r.party, r.title, (r.kind === "income" ? 1 : -1) * r.amount, r.currency, r.status, r.note].map(cell).join(",")));
  return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="anweo-transactions-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" } });
}
