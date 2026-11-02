import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, Totals, fmtDate, money, statusPill } from "@/components/Shell";
import Form from "@/components/Form";
import CurrencySelect from "@/components/CurrencySelect";
import DeleteButton from "@/components/DeleteButton";
import {
  addExpenseAction, addPayRecordAction, deleteExpenseAction, deleteInvoiceAction, deletePayRecordAction,
  markInvoicePaidAction, markPayPaidAction, updateExpenseAction, updateInvoiceAction, updatePayRecordAction,
} from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { loadTransactions, kindLabel, sumByCurrency, type Tx } from "@/lib/transactions";
import { CURRENCIES } from "@/lib/currency";
import { isoDay } from "@/lib/payments";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

const TYPES = [["all", "All"], ["income", "Invoices"], ["expense", "Expenses"], ["pay", "Team pay"]];
const kindDot: Record<string, string> = { income: "bg-forest", expense: "bg-amber-500", pay: "bg-sky-500" };

export default async function Transactions({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role !== "admin") redirect("/");
  const sp = await searchParams;
  const rows = await loadTransactions(sp);
  const shown = rows.slice(0, 200);
  const { inn, out, open } = sumByCurrency(rows);
  const net: Record<string, number> = {};
  for (const c of new Set([...Object.keys(inn), ...Object.keys(out)])) net[c] = Math.round(((inn[c] ?? 0) - (out[c] ?? 0)) * 100) / 100;
  const sb = await supabaseServer();
  const { data: staff } = await sb.from("profiles").select("id,full_name,email,pay_currency").neq("role", "client").eq("status", "active").order("full_name");

  const qs = (over: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, edit: undefined, ...over })) if (v && v !== "all") p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const back = `/transactions${qs({})}`;
  const editing = sp.edit ?? "";
  const filtersActive = ["type", "status", "currency", "q", "from", "to"].some((k) => sp[k] && sp[k] !== "all");

  return (
    <Shell me={me}>
      <PageHead tag="Admin only" title="Transactions" sub="Every invoice, expense and team payment in one place.">
        <a href={`/api/transactions/csv${qs({})}`} className="btn-ghost">Export CSV</a>
      </PageHead>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card-green !p-4"><p className="tag !text-lime">Money in</p><Totals t={inn} className="mt-2 text-xl font-bold leading-snug" empty="Nothing yet" /></div>
        <div className="card !p-4"><p className="tag">Money out</p><Totals t={out} className="mt-2 text-xl font-bold leading-snug" empty="Nothing yet" /></div>
        <div className="card !p-4"><p className="tag">Net</p><Totals t={net} className="mt-2 text-xl font-bold leading-snug" empty="—" /></div>
        <div className="card !p-4"><p className="tag">Still to collect</p><Totals t={open} className="mt-2 text-xl font-bold leading-snug" empty="Nothing" /></div>
      </div>

      <nav className="mb-3 flex flex-wrap gap-2">
        {TYPES.map(([v, l]) => {
          const on = (sp.type ?? "all") === v;
          return <Link key={v} href={`/transactions${qs({ type: v })}`} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${on ? "border-forest bg-forest text-paper" : "border-edge bg-white hover:border-forest/40"}`}>{l}</Link>;
        })}
      </nav>
      <form method="get" className="card mb-6 grid gap-2 !p-3 sm:grid-cols-6">
        <input type="hidden" name="type" value={sp.type ?? "all"} />
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search client, person, description" className="input sm:col-span-2" />
        <select name="status" defaultValue={sp.status ?? "all"} className="input" aria-label="Status">
          {["all", "draft", "due", "overdue", "paid", "pending", "void"].map((s) => <option key={s} value={s}>{s === "all" ? "Any status" : s}</option>)}
        </select>
        <select name="currency" defaultValue={sp.currency ?? "all"} className="input" aria-label="Currency">
          <option value="all">Any currency</option>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <input name="from" type="date" defaultValue={sp.from ?? ""} className="input" aria-label="From date" />
        <input name="to" type="date" defaultValue={sp.to ?? ""} className="input" aria-label="To date" />
        <div className="flex gap-2 sm:col-span-6"><button className="btn-primary !py-2">Apply filters</button>{filtersActive && <Link href="/transactions" className="btn-ghost !py-2">Clear</Link>}</div>
      </form>

      <details className="card mb-6 !p-0">
        <summary className="cursor-pointer list-none px-5 py-3.5 font-semibold">+ Add an expense or team payment</summary>
        <div className="grid gap-6 border-t border-edge p-5 lg:grid-cols-2">
          <Form action={addExpenseAction} className="grid gap-2 sm:grid-cols-2">
            <p className="tag sm:col-span-2">Expense</p>
            <input name="title" required placeholder="What was it for?" className="input sm:col-span-2" />
            <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount" className="input" />
            <CurrencySelect short />
            <input name="category" placeholder="Category (tools, ads…)" className="input" />
            <input name="incurred_on" type="date" defaultValue={isoDay()} className="input" />
            <button className="btn-primary sm:col-span-2">Add expense</button>
          </Form>
          <Form action={addPayRecordAction} className="grid gap-2 sm:grid-cols-2">
            <p className="tag sm:col-span-2">Team payment</p>
            <select name="staff_id" required className="input sm:col-span-2"><option value="">Who?</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</select>
            <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount" className="input" />
            <CurrencySelect name="currency" short extraFirst={{ value: "", label: "Their pay currency" }} defaultValue="" />
            <select name="kind" className="input">{["salary", "commission", "bonus", "reimbursement"].map((k) => <option key={k}>{k}</option>)}</select>
            <input name="period_label" placeholder="Period (November 2026)" className="input" />
            <button className="btn-primary sm:col-span-2">Add payment</button>
          </Form>
        </div>
      </details>

      <p className="mb-2 text-xs text-mute">{rows.length} transaction{rows.length === 1 ? "" : "s"}{rows.length > shown.length ? ` · showing the latest ${shown.length}, narrow the filters or export the CSV for the rest` : ""}</p>
      <div className="space-y-2">
        {shown.length === 0 && <Empty>{filtersActive ? "No transactions match these filters." : "No transactions yet. Invoices, expenses and team pay will appear here."}</Empty>}
        {shown.map((t) => (
          <div key={t.key} className="rounded-xl border border-edge bg-white">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${kindDot[t.kind]}`} title={kindLabel[t.kind]} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.kind === "income" && t.clientId ? <Link href={`/clients/${t.clientId}?tab=billing`} className="hover:text-forest hover:underline">{t.party}</Link> : t.party} <span className="font-normal text-mute">· {t.title}</span></p>
                  <p className="font-mono text-[11px] uppercase text-mute">{kindLabel[t.kind]} · {fmtDate(t.date)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`font-semibold ${t.kind === "income" ? "" : "text-ink/80"}`}>{t.kind === "income" ? "+" : "−"}{money(t.amount, t.currency)}</span>
                <span className={`pill ${statusPill(t.status === "pending" ? "planning" : t.status)}`}>{t.status}</span>
                {t.kind === "income" && (t.status === "due" || t.status === "overdue") && <Form action={markInvoicePaidAction} quiet><input type="hidden" name="id" value={t.id} /><input type="hidden" name="client_id" value={t.clientId} /><button className="text-xs font-medium text-forest hover:underline">Mark paid</button></Form>}
                {t.kind === "pay" && t.status === "pending" && <Form action={markPayPaidAction} quiet><input type="hidden" name="id" value={t.id} /><button className="text-xs font-medium text-forest hover:underline">Mark paid</button></Form>}
                {t.kind === "income" && <Link href={`/invoices/${t.id}`} className="text-xs font-medium text-forest hover:underline">View</Link>}
                <Link href={editing === t.key ? back : `/transactions${qs({ edit: t.key })}`} scroll={false} className="text-xs font-medium text-forest hover:underline">{editing === t.key ? "Close" : "Edit"}</Link>
                <Form action={t.kind === "income" ? deleteInvoiceAction : t.kind === "expense" ? deleteExpenseAction : deletePayRecordAction} quiet>
                  <input type="hidden" name="id" value={t.id} />
                  <DeleteButton message={t.kind === "income" ? "Delete this invoice permanently? If it came from a payment plan, that payment may be invoiced again." : "Delete this transaction permanently?"} />
                </Form>
              </div>
            </div>
            {editing === t.key && <EditForm t={t} back={back} />}
          </div>
        ))}
      </div>
    </Shell>
  );
}

function EditForm({ t, back }: { t: Tx; back: string }) {
  const r = t.raw as Record<string, string>;
  const common = <><input type="hidden" name="id" value={t.id} /><input type="hidden" name="back" value={back} /></>;
  const actions = (
    <div className="flex gap-2 sm:col-span-4"><button className="btn-primary !py-2">Save changes</button><Link href={back} className="btn-ghost !py-2">Cancel</Link></div>
  );
  const box = "grid gap-3 border-t border-edge bg-paper/60 p-4 sm:grid-cols-4";
  if (t.kind === "income") return (
    <Form action={updateInvoiceAction} className={box} quiet>
      {common}
      <div className="sm:col-span-2"><label className="label">Description</label><input name="period_label" required defaultValue={r.period_label} className="input" /></div>
      <div><label className="label">Amount</label><input name="amount" type="number" step="0.01" min="0" required defaultValue={r.amount} className="input" /></div>
      <div><label className="label">Currency</label><CurrencySelect short defaultValue={r.currency} /></div>
      <div><label className="label">Status</label><select name="status" defaultValue={r.status} className="input">{["draft", "due", "overdue", "paid", "void"].map((s) => <option key={s}>{s}</option>)}</select></div>
      <div><label className="label">Issued</label><input name="issued_at" type="date" defaultValue={r.issued_at} className="input" /></div>
      <div><label className="label">Due</label><input name="due_date" type="date" defaultValue={r.due_date} className="input" /></div>
      <div><label className="label">Paid on</label><input name="paid_at" type="date" defaultValue={r.paid_at} className="input" /></div>
      {actions}
    </Form>
  );
  if (t.kind === "expense") return (
    <Form action={updateExpenseAction} className={box} quiet>
      {common}
      <div className="sm:col-span-2"><label className="label">What for</label><input name="title" required defaultValue={r.title} className="input" /></div>
      <div><label className="label">Amount</label><input name="amount" type="number" step="0.01" min="0" required defaultValue={r.amount} className="input" /></div>
      <div><label className="label">Currency</label><CurrencySelect short defaultValue={r.currency} /></div>
      <div><label className="label">Category</label><input name="category" defaultValue={r.category} className="input" /></div>
      <div><label className="label">Date</label><input name="incurred_on" type="date" defaultValue={r.incurred_on} className="input" /></div>
      <div className="sm:col-span-2"><label className="label">Note</label><input name="note" defaultValue={r.note ?? ""} className="input" /></div>
      {actions}
    </Form>
  );
  return (
    <Form action={updatePayRecordAction} className={box} quiet>
      {common}
      <div className="sm:col-span-2"><label className="label">Period</label><input name="period_label" defaultValue={r.period_label} className="input" /></div>
      <div><label className="label">Amount</label><input name="amount" type="number" step="0.01" min="0" required defaultValue={r.amount} className="input" /></div>
      <div><label className="label">Currency</label><CurrencySelect short defaultValue={r.currency} /></div>
      <div><label className="label">Type</label><select name="kind" defaultValue={r.kind} className="input">{["salary", "commission", "bonus", "reimbursement"].map((k) => <option key={k}>{k}</option>)}</select></div>
      <div><label className="label">Status</label><select name="status" defaultValue={r.status} className="input">{["pending", "paid"].map((s) => <option key={s}>{s}</option>)}</select></div>
      <div><label className="label">Paid on</label><input name="paid_at" type="date" defaultValue={r.paid_at} className="input" /></div>
      <div><label className="label">Note</label><input name="note" defaultValue={r.note ?? ""} className="input" /></div>
      {actions}
    </Form>
  );
}
