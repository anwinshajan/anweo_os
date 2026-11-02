import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, Totals, fmtDate, money, showTotals, statusPill, totals } from "@/components/Shell";
import CurrencySelect from "@/components/CurrencySelect";
import { addExpenseAction, addPayRecordAction, markInvoicePaidAction, markPayPaidAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isAdminRole, roleLabel } from "@/lib/roles";

export const dynamic = "force-dynamic";

const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));

export default async function Finance() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !isAdminRole(me.role)) redirect("/");
  const sb = await supabaseServer();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);

  const [{ data: subs }, { data: unpaid }, { data: paidInv }, { data: expenses }, { data: pay }, { data: staff }] = await Promise.all([
    sb.from("client_services").select("price_monthly,currency").eq("status", "active"),
    sb.from("invoices").select("id,client_id,period_label,amount,currency,status,issued_at,clients(business_name)").in("status", ["due", "overdue"]).order("issued_at"),
    sb.from("invoices").select("amount,currency,paid_at").eq("status", "paid").gte("paid_at", monthStart),
    sb.from("expenses").select("id,title,category,amount,currency,incurred_on").order("incurred_on", { ascending: false }).limit(200),
    sb.from("pay_records").select("id,staff_id,period_label,kind,amount,currency,status,paid_at,note,profiles(full_name,email,role)").order("created_at", { ascending: false }).limit(200),
    sb.from("profiles").select("id,full_name,email,role,pay_currency").neq("role", "client").eq("status", "active").order("full_name"),
  ]);
  const mrr = totals((subs ?? []).map((s) => ({ amount: s.price_monthly, currency: s.currency })));
  const outstanding = totals(unpaid ?? []);
  const collected = totals(paidInv ?? []);
  const spentExp = totals((expenses ?? []).filter((e) => e.incurred_on >= monthStart));
  const paidPay = totals((pay ?? []).filter((p) => p.status === "paid" && (p.paid_at ?? "") >= monthStart));
  const pendingPay = totals((pay ?? []).filter((p) => p.status === "pending"));
  const net: Record<string, number> = {};
  for (const c of new Set([...Object.keys(collected), ...Object.keys(spentExp), ...Object.keys(paidPay)])) {
    net[c] = (collected[c] ?? 0) - (spentExp[c] ?? 0) - (paidPay[c] ?? 0);
  }
  const monthName = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

  return (
    <Shell me={me}>
      <PageHead tag="Admin only" title="Finance" sub={`Company financials for ${monthName}. Only you can see this page.`} />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi tag="Monthly recurring" value={<Totals t={mrr} />} green />
        <Kpi tag="Outstanding from clients" value={<Totals t={outstanding} />} hot={Object.keys(outstanding).length > 0} />
        <Kpi tag="Collected this month" value={<Totals t={collected} />} />
        <Kpi tag="Expenses this month" value={<Totals t={spentExp} />} />
        <Kpi tag="Payroll paid this month" value={<Totals t={paidPay} />} />
        <Kpi tag="Net this month" value={<Totals t={net} />} green />
      </div>
      <p className="-mt-5 mb-8 text-xs text-mute">Net = money collected, minus expenses, minus payroll paid. Each currency is shown on its own line and is never converted or added to another.</p>

      <section className="mb-8">
        <p className="tag mb-3">[ Pending payments from clients · {unpaid?.length ?? 0} ]</p>
        <div className="space-y-2">
          {(unpaid ?? []).length === 0 && <Empty>Everything is paid. Nothing outstanding.</Empty>}
          {(unpaid ?? []).map((i: any) => {
            const age = daysSince(i.issued_at);
            return (
              <div key={i.id} className="row flex-wrap">
                <div className="min-w-0">
                  <Link href={`/clients/${i.client_id}?tab=billing`} className="truncate font-medium hover:text-forest hover:underline">{i.clients?.business_name}</Link>
                  <p className="font-mono text-[11px] text-mute">{i.period_label} · issued {fmtDate(i.issued_at)} · {age} day{age === 1 ? "" : "s"} ago</p>
                </div>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{money(i.amount, i.currency)}</span>
                  <span className={`pill ${statusPill(age > 14 ? "overdue" : i.status)}`}>{age > 14 ? "overdue" : i.status}</span>
                  <form action={markInvoicePaidAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="client_id" value={i.client_id} /><button className="text-xs font-medium text-forest hover:underline">Mark paid</button></form>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <p className="tag mb-3">[ Payroll · pending {showTotals(pendingPay)} ]</p>
        <div className="card mb-3">
          <form action={addPayRecordAction} className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2"><label className="label">Team member</label>
              <select name="staff_id" required className="input"><option value="">Choose…</option>{(staff ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.full_name || s.email} · {roleLabel[s.role as keyof typeof roleLabel]} · paid in {s.pay_currency}</option>)}</select></div>
            <div><label className="label">Type</label><select name="kind" className="input"><option value="salary">Salary</option><option value="commission">Commission</option><option value="bonus">Bonus</option><option value="reimbursement">Reimbursement</option></select></div>
            <div><label className="label">Period</label><input name="period_label" placeholder="November 2026" className="input" /></div>
            <div><label className="label">Amount</label><input name="amount" type="number" min="1" step="0.01" required className="input" /></div>
            <div><label className="label">Currency</label><CurrencySelect defaultValue="" extraFirst={{ value: "", label: "Their usual" }} /></div>
            <div className="sm:col-span-5"><input name="note" placeholder="Note (optional)" className="input" aria-label="Note" /></div>
            <div><button className="btn-primary w-full">Add</button></div>
          </form>
        </div>
        <div className="space-y-2">
          {(pay ?? []).length === 0 && <Empty>No payroll records yet.</Empty>}
          {(pay ?? []).slice(0, 40).map((p: any) => (
            <div key={p.id} className="row flex-wrap">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.profiles?.full_name || p.profiles?.email}</p>
                <p className="font-mono text-[11px] uppercase text-mute">{p.kind} · {p.period_label}{p.note ? ` · ${p.note}` : ""}{p.paid_at ? ` · paid ${fmtDate(p.paid_at)}` : ""}</p>
              </div>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{money(p.amount, p.currency)}</span>
                <span className={`pill ${statusPill(p.status)}`}>{p.status}</span>
                {p.status === "pending" && <form action={markPayPaidAction}><input type="hidden" name="id" value={p.id} /><button className="text-xs font-medium text-forest hover:underline">Mark paid</button></form>}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="tag mb-3">[ Expenses ]</p>
        <div className="card mb-3">
          <form action={addExpenseAction} className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2"><label className="label">What for *</label><input name="title" required placeholder="e.g. Canva subscription" className="input" /></div>
            <div><label className="label">Category</label>
              <select name="category" className="input"><option value="tools">Tools & software</option><option value="ads">Ad spend</option><option value="equipment">Equipment</option><option value="travel">Travel</option><option value="office">Office</option><option value="other">Other</option></select></div>
            <div><label className="label">Amount *</label><input name="amount" type="number" min="0.01" step="0.01" required className="input" /></div>
            <div><label className="label">Currency</label><CurrencySelect /></div>
            <div><label className="label">Date</label><input name="incurred_on" type="date" className="input" /></div>
            <div className="sm:col-span-6"><button className="btn-primary">Add expense</button></div>
          </form>
        </div>
        <div className="space-y-2">
          {(expenses ?? []).length === 0 && <Empty>No expenses recorded yet.</Empty>}
          {(expenses ?? []).slice(0, 30).map((e) => (
            <div key={e.id} className="row"><div className="min-w-0"><p className="truncate font-medium">{e.title}</p><p className="font-mono text-[11px] uppercase text-mute">{e.category} · {fmtDate(e.incurred_on)}</p></div><span className="font-semibold">{money(e.amount, e.currency)}</span></div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function Kpi({ tag, value, green, hot }: { tag: string; value: React.ReactNode; green?: boolean; hot?: boolean }) {
  return (
    <div className={`${green ? "card-green" : "card"} !p-4 ${hot ? "ring-2 ring-lime" : ""}`}>
      <p className={`tag ${green ? "!text-lime" : ""}`}>{tag}</p>
      <div className="mt-2 text-xl font-bold leading-snug tracking-tight sm:text-2xl">{value}</div>
    </div>
  );
}
