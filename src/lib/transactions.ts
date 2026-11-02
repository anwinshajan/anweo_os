import { supabaseServer } from "@/lib/supabase-server";

export type TxKind = "income" | "expense" | "pay";
export type Tx = {
  key: string; kind: TxKind; id: string; date: string; title: string; party: string; note: string;
  amount: number; currency: string; status: string; clientId?: string;
  // raw fields needed by the edit forms
  raw: Record<string, string | number | null>;
};
export type TxFilter = { type?: string; status?: string; currency?: string; q?: string; from?: string; to?: string };

const day = (s: string | null | undefined) => (s ?? "").slice(0, 10);

// Every invoice, expense and pay record as one list, newest first. Admin only (row-level security enforces it too).
export async function loadTransactions(f: TxFilter): Promise<Tx[]> {
  const sb = await supabaseServer();
  const want = (k: TxKind) => !f.type || f.type === "all" || f.type === k;
  const [inv, exp, pay] = await Promise.all([
    want("income") ? sb.from("invoices").select("id,client_id,period_label,amount,currency,status,issued_at,due_date,paid_at,clients(business_name)").order("issued_at", { ascending: false }).limit(1000) : { data: [] },
    want("expense") ? sb.from("expenses").select("id,title,category,amount,currency,incurred_on,note").order("incurred_on", { ascending: false }).limit(1000) : { data: [] },
    want("pay") ? sb.from("pay_records").select("id,staff_id,period_label,kind,amount,currency,status,paid_at,note,created_at,profiles(full_name,email)").order("created_at", { ascending: false }).limit(1000) : { data: [] },
  ]);
  const rows: Tx[] = [];
  for (const i of (inv.data ?? []) as any[]) {
    rows.push({ key: `income:${i.id}`, kind: "income", id: i.id, date: day(i.status === "paid" ? i.paid_at ?? i.issued_at : i.issued_at), title: i.period_label, party: i.clients?.business_name ?? "Client", note: "", amount: Number(i.amount), currency: i.currency, status: i.status, clientId: i.client_id,
      raw: { period_label: i.period_label, amount: i.amount, currency: i.currency, status: i.status, issued_at: day(i.issued_at), due_date: day(i.due_date), paid_at: day(i.paid_at) } });
  }
  for (const e of (exp.data ?? []) as any[]) {
    rows.push({ key: `expense:${e.id}`, kind: "expense", id: e.id, date: day(e.incurred_on), title: e.category, party: e.title, note: e.note ?? "", amount: Number(e.amount), currency: e.currency, status: "paid",
      raw: { title: e.title, amount: e.amount, currency: e.currency, category: e.category, incurred_on: day(e.incurred_on), note: e.note } });
  }
  for (const p of (pay.data ?? []) as any[]) {
    rows.push({ key: `pay:${p.id}`, kind: "pay", id: p.id, date: day(p.paid_at ?? p.created_at), title: `${p.kind} · ${p.period_label}`, party: p.profiles?.full_name || p.profiles?.email || "Team member", note: p.note ?? "", amount: Number(p.amount), currency: p.currency, status: p.status,
      raw: { period_label: p.period_label, kind: p.kind, amount: p.amount, currency: p.currency, status: p.status, paid_at: day(p.paid_at), note: p.note } });
  }
  const q = (f.q ?? "").trim().toLowerCase();
  return rows
    .filter((r) => !f.status || f.status === "all" || r.status === f.status)
    .filter((r) => !f.currency || f.currency === "all" || r.currency === f.currency)
    .filter((r) => !f.from || r.date >= f.from)
    .filter((r) => !f.to || r.date <= f.to)
    .filter((r) => !q || `${r.title} ${r.party} ${r.note}`.toLowerCase().includes(q))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export const kindLabel: Record<TxKind, string> = { income: "Invoice", expense: "Expense", pay: "Team pay" };

// Money in is paid invoices; money out is expenses and paid team pay. Pending/draft items are "expected", not counted.
export function sumByCurrency(rows: Tx[]) {
  const inn: Record<string, number> = {}, out: Record<string, number> = {}, open: Record<string, number> = {};
  for (const r of rows) {
    const add = (m: Record<string, number>) => { m[r.currency] = Math.round(((m[r.currency] ?? 0) + r.amount) * 100) / 100; };
    if (r.kind === "income") { if (r.status === "paid") add(inn); else if (r.status === "due" || r.status === "overdue") add(open); }
    else if (r.status === "paid") add(out);
  }
  return { inn, out, open };
}
