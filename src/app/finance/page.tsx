import Link from "next/link";
import Form from "@/components/Form";
import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, Totals, fmtDate, money, statusPill, totals } from "@/components/Shell";
import DeleteButton from "@/components/DeleteButton";
import { chargeLateInterestAction, deleteInvoiceAction, markInvoicePaidAction, runBillingAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isAdminRole } from "@/lib/roles";
import { addDays, effectiveDueDate, intervalLabel, isOverdue, isoDay, lateInterest } from "@/lib/payments";

export const dynamic = "force-dynamic";


export default async function Finance() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !isAdminRole(me.role)) redirect("/");
  const sb = await supabaseServer();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);

  const today = isoDay();
  const [{ data: subs }, { data: unpaid }, { data: paidInv }, { data: expenses }, { data: pay }, { data: dueRecurring }, { data: dueInstallments }] = await Promise.all([
    sb.from("client_services").select("price_monthly,currency").eq("status", "active"),
    sb.from("invoices").select("id,client_id,period_label,amount,currency,status,issued_at,due_date,late_fee_charged,clients(business_name,payment_terms_days,late_grace_days,late_interest_percent)").in("status", ["due", "overdue"]).order("issued_at"),
    sb.from("invoices").select("amount,currency,paid_at").eq("status", "paid").gte("paid_at", monthStart),
    sb.from("expenses").select("id,title,category,amount,currency,incurred_on").order("incurred_on", { ascending: false }).limit(200),
    sb.from("pay_records").select("id,staff_id,period_label,kind,amount,currency,status,paid_at,note,profiles(full_name,email,role)").order("created_at", { ascending: false }).limit(200),
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
            <Form action={runBillingAction} className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn-primary">Create these invoices now</button>
              <span className="text-xs text-forest/80">Each one is created once. Recurring plans set to automatic are also created by themselves every morning.</span>
            </Form>
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
                <Form action={markInvoicePaidAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="client_id" value={i.client_id} /><button className="text-xs font-medium text-forest hover:underline">Mark paid</button></Form>
                <Form action={deleteInvoiceAction}><input type="hidden" name="id" value={i.id} /><DeleteButton message="Delete this invoice permanently? If it came from a payment plan, that payment becomes un-invoiced and may be invoiced again. To keep a record without billing, mark it paid instead." /></Form>
                {i.late && i.unbilled >= 0.01 && <Form action={chargeLateInterestAction}><input type="hidden" name="id" value={i.id} /><button className="text-xs font-medium text-amber-800 hover:underline">Charge {money(i.unbilled, i.currency)} interest</button></Form>}
              </span>
            </div>
          ))}
        </div>
      </section>

      <Link href="/transactions" className="card flex items-center justify-between !p-4 hover:border-forest/40">
        <span><span className="font-semibold">All transactions</span><span className="block text-sm text-mute">Invoices, expenses and team pay: search, edit, delete, export.</span></span>
        <span className="text-forest">Open →</span>
      </Link>
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
