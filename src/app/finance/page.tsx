import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, Totals, fmtDate, money, showTotals, statusPill, totals } from "@/components/Shell";
import CurrencySelect from "@/components/CurrencySelect";
import { addExpenseAction, addPayRecordAction, chargeLateInterestAction, markInvoicePaidAction, markPayPaidAction, runBillingAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isAdminRole, roleLabel } from "@/lib/roles";
import { addDays, effectiveDueDate, intervalLabel, isOverdue, isoDay, lateInterest } from "@/lib/payments";

export const dynamic = "force-dynamic";


export default async function Finance() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !isAdminRole(me.role)) redirect("/");
  const sb = await supabaseServer();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);

  const today = isoDay();
  const [{ data: subs }, { data: unpaid }, { data: paidInv }, { data: expenses }, { data: pay }, { data: staff }, { data: dueRecurring }, { data: dueInstallments }] = await Promise.all([
    sb.from("client_services").select("price_monthly,currency").eq("status", "active"),
    sb.from("invoices").select("id,client_id,period_label,amount,currency,status,issued_at,due_date,late_fee_charged,clients(business_name,payment_terms_days,late_grace_days,late_interest_percent)").in("status", ["due", "overdue"]).order("issued_at"),
    sb.from("invoices").select("amount,currency,paid_at").eq("status", "paid").gte("paid_at", monthStart),
    sb.from("expenses").select("id,title,category,amount,currency,incurred_on").order("incurred_on", { ascending: false }).limit(200),
    sb.from("pay_records").select("id,staff_id,period_label,kind,amount,currency,status,paid_at,note,profiles(full_name,email,role)").order("created_at", { ascending: false }).limit(200),
    sb.from("profiles").select("id,full_name,email,role,pay_currency").neq("role", "client").eq("status", "active").order("full_name"),
    sb.from("payment_plans").select("id,client_id,title,currency,recurring_amount,billing_interval,next_invoice_date,auto_invoice,clients(business_name)").eq("kind", "recurring").eq("status", "active").lte("next_invoice_date", today),
    sb.from("plan_installments").select("id,label,amount,due_date,payment_plans!inner(client_id,title,currency,status,kind,clients(business_name))").is("invoice_id", null).not("due_date", "is", null).lte("due_date", addDays(today, 7)).eq("payment_plans.status", "active").eq("payment_plans.kind", "one_time"),
  ]);

  // Each unpaid invoice with its real due date, how late it is, and the interest that has built up.
  const rows = (unpaid ?? []).map((i: any) => {
    const c = i.clients ?? { payment_terms_days: 7, late_grace_days: 0, late_interest_percent: 0 };
    const due = effectiveDueDate(i, c.payment_terms_days);
    const late = isOverdue(due, today);
    const accrued = lateInterest({ amount: Number(i.amount), due, today, graceDays: c.late_grace_days, percentPerWeek: Number(c.late_interest_percent) });
    const unbilled = Math.max(0, Math.round((accrued - Number(i.late_fee_charged ?? 0)) * 100) / 100);
    const daysOver = late ? Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0;
    return { ...i, due, late, unbilled, daysOver };
  });
  const overdueNow = totals(rows.filter((r) => r.late));
  const unbilledInterest = totals(rows.filter((r) => r.unbilled > 0).map((r) => ({ amount: r.unbilled, currency: r.currency })));
  const readyCount = (dueRecurring ?? []).length + (dueInstallments ?? []).length;
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

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi tag="Monthly recurring" value={<Totals t={mrr} />} green />
        <Kpi tag="Outstanding from clients" value={<Totals t={outstanding} />} hot={Object.keys(outstanding).length > 0} />
        <Kpi tag="Overdue now" value={<Totals t={overdueNow} empty="None" />} hot={Object.keys(overdueNow).length > 0} />
        <Kpi tag="Late interest not yet charged" value={<Totals t={unbilledInterest} empty="None" />} />
        <Kpi tag="Collected this month" value={<Totals t={collected} />} />
        <Kpi tag="Expenses this month" value={<Totals t={spentExp} />} />
        <Kpi tag="Payroll paid this month" value={<Totals t={paidPay} />} />
        <Kpi tag="Net this month" value={<Totals t={net} />} green />
      </div>
      <p className="-mt-5 mb-8 text-xs text-mute">Net = money collected, minus expenses, minus payroll paid. Each currency is shown on its own line and is never converted or added to another.</p>

      {readyCount > 0 && (
        <section className="mb-8">
          <p className="tag mb-3">[ Ready to invoice · {readyCount} ]</p>
          <div className="card !border-lime !bg-lime-soft">
            <div className="space-y-2">
              {(dueRecurring ?? []).map((r: any) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span><Link href={`/clients/${r.client_id}?tab=billing`} className="font-medium hover:underline">{r.clients?.business_name}</Link> · {r.title} <span className="font-mono text-[11px] text-forest/70">every {intervalLabel[r.billing_interval]} · due {fmtDate(r.next_invoice_date)}{r.auto_invoice ? " · automatic" : ""}</span></span>
                  <span className="font-semibold">{money(r.recurring_amount, r.currency)}</span>
                </div>
              ))}
              {(dueInstallments ?? []).map((x: any) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span><Link href={`/clients/${x.payment_plans?.client_id}?tab=billing`} className="font-medium hover:underline">{x.payment_plans?.clients?.business_name}</Link> · {x.payment_plans?.title} · {x.label} <span className="font-mono text-[11px] text-forest/70">due {fmtDate(x.due_date)}</span></span>
                  <span className="font-semibold">{money(x.amount, x.payment_plans?.currency)}</span>
                </div>
              ))}
            </div>
            <form action={runBillingAction} className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn-primary">Create these invoices now</button>
              <span className="text-xs text-forest/80">Each one is created once. Recurring plans set to automatic are also created by themselves every morning.</span>
            </form>
          </div>
        </section>
      )}

      <section className="mb-8">
        <p className="tag mb-3">[ Pending payments from clients · {rows.length} ]</p>
        <div className="space-y-2">
          {rows.length === 0 && <Empty>Everything is paid. Nothing outstanding.</Empty>}
          {rows.map((i: any) => (
            <div key={i.id} className="row flex-wrap">
              <div className="min-w-0">
                <Link href={`/clients/${i.client_id}?tab=billing`} className="truncate font-medium hover:text-forest hover:underline">{i.clients?.business_name}</Link>
                <p className="font-mono text-[11px] text-mute">{i.period_label} · due {fmtDate(i.due)}{i.late ? ` · ${i.daysOver} day${i.daysOver === 1 ? "" : "s"} overdue` : ""}</p>
              </div>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{money(i.amount, i.currency)}</span>
                <span className={`pill ${statusPill(i.late ? "overdue" : i.status)}`}>{i.late ? "overdue" : i.status}</span>
                <form action={markInvoicePaidAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="client_id" value={i.client_id} /><button className="text-xs font-medium text-forest hover:underline">Mark paid</button></form>
                {i.late && i.unbilled >= 0.01 && <form action={chargeLateInterestAction}><input type="hidden" name="id" value={i.id} /><button className="text-xs font-medium text-amber-800 hover:underline">Charge {money(i.unbilled, i.currency)} interest</button></form>}
              </span>
            </div>
          ))}
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
