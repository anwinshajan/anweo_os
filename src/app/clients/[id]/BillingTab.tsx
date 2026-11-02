import { Empty, Totals, fmtDate, money, statusPill, totals } from "@/components/Shell";
import CurrencySelect from "@/components/CurrencySelect";
import {
  addInvoiceAction, chargeLateInterestAction, createOneTimePlanAction, createRecurringPlanAction, invoiceInstallmentAction,
  invoiceRecurringNowAction, markInvoicePaidAction, savePaymentTermsAction, sendDraftInvoiceAction, setPlanStatusAction,
} from "@/app/actions";
import { supabaseServer } from "@/lib/supabase-server";
import { addDays, daysLate, effectiveDueDate, intervalLabel, isOverdue, isoDay, lateInterest } from "@/lib/payments";

type Client = { id: string; currency: string; payment_terms_days: number; late_grace_days: number; late_interest_percent: number | string };

export default async function BillingTab({ id, client }: { id: string; client: Client }) {
  const sb = await supabaseServer();
  const today = isoDay();
  const [{ data: invoices }, { data: plans }] = await Promise.all([
    sb.from("invoices").select("*").eq("client_id", id).order("issued_at", { ascending: false }),
    sb.from("payment_plans").select("*, plan_installments(id,label,percent,amount,due_date,invoice_id,sort_order)").eq("client_id", id).order("created_at", { ascending: false }),
  ]);

  const terms = client.payment_terms_days;
  const pct = Number(client.late_interest_percent);
  const byId = new Map((invoices ?? []).map((i: any) => [i.id, i]));

  // Money still to come in, money received, and interest that has built up but isn't charged yet.
  const open = (invoices ?? []).filter((i: any) => i.status === "due" || i.status === "overdue");
  const owed = totals(open);
  const paid = totals((invoices ?? []).filter((i: any) => i.status === "paid"));
  const interestFor = (i: any) => {
    const accrued = lateInterest({ amount: Number(i.amount), due: effectiveDueDate(i, terms), today, graceDays: client.late_grace_days, percentPerMonth: pct });
    return { accrued, unbilled: Math.max(0, Math.round((accrued - Number(i.late_fee_charged ?? 0)) * 100) / 100) };
  };
  const unbilledInterest = totals(open.map((i: any) => ({ amount: interestFor(i).unbilled, currency: i.currency })).filter((x) => x.amount > 0));

  return (
    <>
      <section className="card">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-paper p-3"><p className="tag">Outstanding</p><Totals t={owed} className="text-xl font-bold leading-snug" /></div>
          <div className="rounded-xl bg-paper p-3"><p className="tag">Paid to date</p><Totals t={paid} className="text-xl font-bold leading-snug text-forest" /></div>
          <div className={`rounded-xl p-3 ${Object.keys(unbilledInterest).length ? "bg-amber-50" : "bg-paper"}`}><p className="tag">Late interest not yet charged</p><Totals t={unbilledInterest} empty="None" className="text-xl font-bold leading-snug" /></div>
        </div>
      </section>

      {/* ---------------- Payment terms ---------------- */}
      <section className="card">
        <p className="tag mb-3">[ Payment terms for this client ]</p>
        <form action={savePaymentTermsAction} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="client_id" value={id} />
          <div><label className="label">Pay within (days)</label><input name="payment_terms_days" type="number" min="0" max="180" step="1" defaultValue={client.payment_terms_days} className="input" /></div>
          <div><label className="label">Grace period (days)</label><input name="late_grace_days" type="number" min="0" max="90" step="1" defaultValue={client.late_grace_days} className="input" /></div>
          <div><label className="label">Late interest (% per month)</label><input name="late_interest_percent" type="number" min="0" max="50" step="0.01" defaultValue={pct} className="input" /></div>
          <div className="flex items-end"><button className="btn-primary w-full">Save terms</button></div>
          <p className="text-xs text-mute sm:col-span-4">
            New invoices are due {terms} days after they're issued. {pct > 0
              ? `If one is paid late, interest of ${pct}% a month builds up after a ${client.late_grace_days}-day grace period (simple interest, not compounded). You decide whether to charge it.`
              : "Late interest is off for this client. Set a rate above to turn it on."}{" "}
            The client can see these terms. Make sure they match what you agreed in the contract.
          </p>
        </form>
      </section>

      {/* ---------------- Payment plans ---------------- */}
      <section className="card">
        <p className="tag mb-3">[ Payment plans ]</p>
        <div className="space-y-3">
          {(plans ?? []).length === 0 && <Empty>No payment plans yet. Add a one-time payment (with an advance and a final payment) or a recurring one below.</Empty>}
          {(plans ?? []).map((p: any) => {
            const inst = [...(p.plan_installments ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
            const allPaid = p.kind === "one_time" && inst.length > 0 && inst.every((x: any) => byId.get(x.invoice_id)?.status === "paid");
            const state = allPaid ? "completed" : p.status;
            return (
              <div key={p.id} className="rounded-xl border border-edge bg-paper/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.title}</p>
                    <p className="font-mono text-[11px] uppercase text-mute">
                      {p.kind === "one_time" ? `One-time · total ${money(p.total_amount, p.currency)}` : `Recurring · ${money(p.recurring_amount, p.currency)} every ${intervalLabel[p.billing_interval]}`}
                    </p>
                  </div>
                  <span className={`pill ${statusPill(state)}`}>{state}</span>
                </div>

                {p.kind === "one_time" && (
                  <div className="mt-3 space-y-1.5">
                    {inst.map((x: any) => {
                      const inv: any = x.invoice_id ? byId.get(x.invoice_id) : null;
                      const due = inv ? effectiveDueDate(inv, terms) : x.due_date;
                      const late = inv && inv.status !== "paid" && due && isOverdue(due, today);
                      const label = inv ? (inv.status === "paid" ? "paid" : late ? "overdue" : "invoiced") : "not invoiced";
                      return (
                        <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">{x.label} <span className="font-mono text-[11px] text-mute">· {Number(x.percent)}%</span></p>
                            <p className="font-mono text-[11px] text-mute">
                              {inv ? (inv.status === "paid" ? `Paid ${fmtDate(inv.paid_at)}` : `Due ${fmtDate(due)}`) : x.due_date ? (x.due_date <= addDays(today, 7) ? `Due ${fmtDate(x.due_date)} · invoiced in the next billing run` : `Due ${fmtDate(x.due_date)} · invoice goes out 7 days before`) : "No date: invoice it when ready"}
                            </p>
                          </div>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold">{money(x.amount, p.currency)}</span>
                            <span className={`pill ${statusPill(label === "invoiced" ? "due" : label === "not invoiced" ? "planning" : label)}`}>{label}</span>
                            {!inv && p.status === "active" && (
                              <form action={invoiceInstallmentAction}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="client_id" value={id} /><button className="text-xs font-medium text-forest hover:underline">Invoice now</button></form>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {p.kind === "recurring" && (
                  <div className="mt-3 rounded-lg bg-white px-3 py-2.5 text-sm">
                    <p className="font-mono text-[11px] text-mute">
                      Started {fmtDate(p.start_date)} · {p.periods_billed} invoiced · {p.status === "completed" ? "finished" : `next invoice ${fmtDate(p.next_invoice_date)}`}{p.end_date ? ` · ends ${fmtDate(p.end_date)}` : ""} · {p.auto_invoice ? "invoices are created automatically" : "you create the invoices"}
                    </p>
                  </div>
                )}

                {p.status !== "cancelled" && !allPaid && p.status !== "completed" && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {p.kind === "recurring" && p.status === "active" && (
                      <form action={invoiceRecurringNowAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="client_id" value={id} /><button className="btn-ghost !px-3 !py-1.5 text-xs">Create next invoice now</button></form>
                    )}
                    <form action={setPlanStatusAction} className="flex items-center gap-3">
                      <input type="hidden" name="id" value={p.id} /><input type="hidden" name="client_id" value={id} />
                      {p.status === "active" ? <button name="status" value="paused" className="text-xs font-medium text-mute hover:text-ink hover:underline">Pause</button> : <button name="status" value="active" className="text-xs font-medium text-forest hover:underline">Resume</button>}
                      <button name="status" value="cancelled" className="text-xs font-medium text-red-700 hover:underline">End this plan</button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <details className="mt-5 border-t border-edge pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-forest">+ One-time payment (advance + final, or other split)</summary>
          <form action={createOneTimePlanAction} className="mt-4 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="client_id" value={id} />
            <div className="sm:col-span-2"><label className="label">What is it for? *</label><input name="title" required placeholder="e.g. Website build" className="input" /></div>
            <div><label className="label">Total amount *</label><input name="total" type="number" min="0.01" step="0.01" required className="input" /></div>
            <div><label className="label">Currency</label><CurrencySelect defaultValue={client.currency} /></div>
            <div className="sm:col-span-4">
              <p className="label">Payments (up to four). Percentages must add up to 100.</p>
              <div className="space-y-2">
                {[
                  { l: "Advance", p: "50", d: today }, { l: "Final", p: "50", d: "" }, { l: "", p: "", d: "" }, { l: "", p: "", d: "" },
                ].map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5.5rem_9.5rem] gap-2">
                    <input name={`label_${i + 1}`} defaultValue={r.l} placeholder={`Payment ${i + 1} name`} className="input" aria-label={`Payment ${i + 1} name`} />
                    <input name={`percent_${i + 1}`} type="number" min="0.01" max="100" step="0.01" defaultValue={r.p} placeholder="%" className="input" aria-label={`Payment ${i + 1} percent`} />
                    <input name={`due_${i + 1}`} type="date" defaultValue={r.d} className="input" aria-label={`Payment ${i + 1} due date`} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-mute">Payments with a date are invoiced automatically 7 days before they're due (an advance due today is invoiced straight away). Leave the date blank to invoice a payment by hand later, for example when the work is delivered.</p>
            </div>
            <div className="sm:col-span-4"><label className="label">Notes (internal)</label><input name="notes" className="input" /></div>
            <div className="sm:col-span-4"><button className="btn-primary">Create payment plan</button></div>
          </form>
        </details>

        <details className="mt-3 border-t border-edge pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-forest">+ Recurring payment (monthly, quarterly or yearly)</summary>
          <form action={createRecurringPlanAction} className="mt-4 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="client_id" value={id} />
            <div className="sm:col-span-2"><label className="label">What is it for? *</label><input name="title" required placeholder="e.g. Social media retainer" className="input" /></div>
            <div><label className="label">Amount each time *</label><input name="amount" type="number" min="0.01" step="0.01" required className="input" /></div>
            <div><label className="label">Currency</label><CurrencySelect defaultValue={client.currency} /></div>
            <div><label className="label">Repeats</label>
              <select name="billing_interval" className="input" defaultValue="monthly"><option value="monthly">Every month</option><option value="quarterly">Every 3 months</option><option value="yearly">Every year</option></select></div>
            <div><label className="label">First invoice date</label><input name="start_date" type="date" defaultValue={today} className="input" /></div>
            <div><label className="label">Ends (optional)</label><input name="end_date" type="date" className="input" /></div>
            <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" name="auto_invoice" defaultChecked className="h-4 w-4 accent-forest" /> Create invoices automatically</label>
            <div className="sm:col-span-4"><label className="label">Notes (internal)</label><input name="notes" className="input" /></div>
            <p className="text-xs text-mute sm:col-span-4">With automatic invoicing on, each invoice is created and shown to the client on its date. With it off, it appears under Finance → “Ready to invoice” for you to create.</p>
            <div className="sm:col-span-4"><button className="btn-primary">Create recurring payment</button></div>
          </form>
        </details>
      </section>

      {/* ---------------- Invoices ---------------- */}
      <section className="card">
        <p className="tag mb-3">[ Invoices ]</p>
        <div className="space-y-2">
          {(invoices ?? []).length === 0 && <Empty>No invoices yet.</Empty>}
          {(invoices ?? []).map((i: any) => {
            const due = effectiveDueDate(i, terms);
            const unpaid = i.status === "due" || i.status === "overdue";
            const late = unpaid && isOverdue(due, today);
            const { accrued, unbilled } = interestFor(i);
            const dl = daysLate(due, today, client.late_grace_days);
            return (
              <div key={i.id} className="row flex-wrap">
                <div className="min-w-0">
                  <p className="truncate">{i.period_label}</p>
                  <p className="font-mono text-[11px] text-mute">
                    Issued {fmtDate(i.issued_at)}{i.status !== "draft" ? ` · due ${fmtDate(due)}` : ""}{i.status === "paid" && i.paid_at ? ` · paid ${fmtDate(i.paid_at)}` : ""}
                  </p>
                  {late && (
                    <p className="mt-0.5 font-mono text-[11px] text-red-700">
                      {Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000)} days overdue
                      {accrued > 0 ? ` · interest so far ${money(accrued, i.currency)}${Number(i.late_fee_charged) > 0 ? ` (${money(i.late_fee_charged, i.currency)} charged)` : ""}` : dl === 0 && pct > 0 ? " · inside the grace period" : ""}
                    </p>
                  )}
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{money(i.amount, i.currency)}</span>
                  <span className={`pill ${statusPill(late ? "overdue" : i.status)}`}>{late ? "overdue" : i.status}</span>
                  <a href={`/invoices/${i.id}`} className="text-xs font-medium text-forest hover:underline">Invoice</a>
                  {i.status === "draft" && <form action={sendDraftInvoiceAction}><input type="hidden" name="id" value={i.id} /><button className="text-xs font-medium text-forest hover:underline">Send to client</button></form>}
                  {unpaid && <form action={markInvoicePaidAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="client_id" value={id} /><button className="text-xs font-medium text-forest hover:underline">Mark paid</button></form>}
                  {late && unbilled >= 0.01 && (
                    <form action={chargeLateInterestAction}><input type="hidden" name="id" value={i.id} /><button className="text-xs font-medium text-amber-800 hover:underline">Charge {money(unbilled, i.currency)} interest</button></form>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <form action={addInvoiceAction} className="mt-5 grid gap-3 border-t border-edge pt-5 sm:grid-cols-5">
          <input type="hidden" name="client_id" value={id} />
          <div><label className="label">Describe it</label><input name="period_label" placeholder="e.g. Logo design" className="input" /></div>
          <div><label className="label">Amount</label><input name="amount" type="number" min="1" step="0.01" required className="input" /></div>
          <div><label className="label">Currency</label><CurrencySelect defaultValue={client.currency} /></div>
          <div><label className="label">Due date (optional)</label><input name="due_date" type="date" className="input" /></div>
          <div className="flex items-end"><button className="btn-primary w-full">Add invoice</button></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-5"><input type="checkbox" name="draft" className="h-4 w-4 accent-forest" /> Save as draft (the client won't see it yet)</label>
          <p className="text-xs text-mute sm:col-span-5">A single invoice outside any plan. Leave the due date blank to use this client's {terms}-day terms.</p>
        </form>
      </section>
    </>
  );
}
