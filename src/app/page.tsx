import Link from "next/link";
import Form from "@/components/Form";
import { redirect } from "next/navigation";
import PostThumb from "@/components/PostThumb";
import Shell, { Empty, PageHead, Totals, fmtDate, label, money, statusPill, totals } from "@/components/Shell";
import { Corner, Logo } from "@/components/Logo";
import { signDocumentAction } from "./actions";
import { getMe, supabaseServer, type Me } from "@/lib/supabase-server";
import { isAdminRole, isLeadRole } from "@/lib/roles";
import { effectiveDueDate, intervalLabel, isOverdue, isoDay } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 text-center">
        <div className="mx-auto"><Logo /></div>
        <div className="card">
          <h1 className="text-xl font-bold">{me.status === "pending" ? "Awaiting approval" : "Account disabled"}</h1>
          <p className="mt-2 text-sm text-mute">
            {me.status === "pending" ? "Your account is created. A manager will activate it shortly." : "This account has been disabled. Please contact the Anweo team."}
          </p>
        </div>
      </main>
    );
  }
  const { q, show } = await searchParams;
  return <Shell me={me}>{me.role === "client" ? <ClientPortal me={me} /> : <StaffHome me={me} q={q ?? ""} archived={show === "archived"} />}</Shell>;
}

/* ---------------- Staff ---------------- */
async function StaffHome({ me, q, archived }: { me: Me; q: string; archived: boolean }) {
  const sb = await supabaseServer();
  const lead = isLeadRole(me.role);
  const admin = isAdminRole(me.role);
  const term = q.replace(/[%_\\,()]/g, "").trim().slice(0, 60);

  let clientQuery = sb.from("clients").select("id,business_name,contact_name,country,status").eq("status", archived ? "archived" : "active").order("created_at", { ascending: false });
  if (term) clientQuery = clientQuery.ilike("business_name", `%${term}%`);

  const [{ data: clients }, { data: subs }, { count: pending }, { count: myTasks }, { data: due }] = await Promise.all([
    clientQuery,
    sb.from("client_services").select("client_id,price_monthly,currency,status,services(name)").eq("status", "active"),
    sb.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "awaiting_approval"),
    sb.from("work_items").select("id", { count: "exact", head: true }).eq("assignee", me.id).neq("status", "done"),
    admin ? sb.from("invoices").select("amount,currency,status").in("status", ["due", "overdue"]) : Promise.resolve({ data: [] as { amount: number; currency: string; status: string }[] }),
  ]);

  const byClient = new Map<string, string[]>();
  (subs ?? []).forEach((s: any) => byClient.set(s.client_id, [...(byClient.get(s.client_id) ?? []), s.services?.name]));

  return (
    <div className="space-y-6">
      <PageHead tag="Workspace" title={archived ? "Archived clients" : "Clients"} sub="Everyone Anweo is working for, and what they've signed up to.">
        {lead && <Link href="/clients/new" className="btn-primary">+ Add client</Link>}
      </PageHead>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tag="Clients" value={String(clients?.length ?? 0)} />
        <Stat tag="Needs approval" value={String(pending ?? 0)} href="/approvals" hot={(pending ?? 0) > 0} />
        <Stat tag="My open tasks" value={String(myTasks ?? 0)} href="/tasks" />
        {admin ? (
          <Stat tag="Outstanding" value={<Totals t={totals(due ?? [])} />} href="/finance" hot={(due ?? []).length > 0} green />
        ) : (
          <Stat tag="Active services" value={String(lead ? (subs?.length ?? 0) : "-")} />
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex flex-1 gap-2" role="search">
          {archived && <input type="hidden" name="show" value="archived" />}
          <input name="q" defaultValue={term} placeholder="Search clients" className="input" aria-label="Search clients" />
          <button className="btn-ghost">Search</button>
          {term && <Link href={archived ? "/?show=archived" : "/"} className="btn-ghost">Clear</Link>}
        </form>
        <Link href={archived ? "/" : "/?show=archived"} className="tag hover:text-forest">{archived ? "← Active clients" : "Archived →"}</Link>
      </div>

      <section className="space-y-2.5">
        {(clients ?? []).length === 0 && (
          <Empty>
            {term ? `No clients match “${term}”.` : archived ? "No archived clients." : lead ? <>No clients yet. <Link href="/clients/new" className="font-semibold text-forest underline">Add your first client</Link>.</> : "No clients yet."}
          </Empty>
        )}
        {(clients ?? []).map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} className="card flex items-center gap-4 !p-4 transition hover:-translate-y-0.5 hover:border-forest/40">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest text-base font-bold text-lime">{c.business_name[0]?.toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.business_name}</p>
              <p className="truncate text-xs text-mute">{c.contact_name || "No contact yet"} · {c.country}</p>
            </div>
            <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
              {(byClient.get(c.id) ?? []).slice(0, 3).map((n) => <span key={n} className="pill bg-forest-soft text-forest">{n}</span>)}
              {lead && (byClient.get(c.id) ?? []).length === 0 && <span className="pill bg-amber-100 text-amber-800">No services</span>}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}

function Stat({ tag, value, href, hot, green }: { tag: string; value: React.ReactNode; href?: string; hot?: boolean; green?: boolean }) {
  const body = (
    <div className={`${green ? "card-green" : "card"} !p-4 ${hot ? "ring-2 ring-lime" : ""} h-full`}>
      <p className={`tag ${green ? "!text-lime" : ""}`}>{tag}</p>
      <div className="mt-2 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/* ---------------- Client portal ---------------- */
async function ClientPortal({ me }: { me: Me }) {
  const sb = await supabaseServer();
  const cid = me.client_id;
  if (!cid) {
    return <div className="card text-center"><p className="font-semibold">Your account isn't linked to a business yet.</p><p className="mt-1 text-sm text-mute">Please ask the Anweo team to finish setting you up.</p></div>;
  }
  const [{ data: client }, { data: subs }, { data: projects }, { data: work }, { data: posts }, { data: invoices }, { data: docs }, { data: history }, { data: plans }] = await Promise.all([
    sb.from("clients").select("business_name,payment_terms_days,late_grace_days,late_interest_percent").eq("id", cid).single(),
    sb.from("client_services").select("id,price_monthly,currency,status,start_date,services(name,description)").eq("client_id", cid).order("created_at"),
    sb.from("projects").select("id,title,description,status,due_date,milestones(id,title,done,sort_order)").eq("client_id", cid).order("created_at", { ascending: false }),
    sb.from("work_items").select("id,title,status,due_date,updated_at").eq("client_id", cid).order("updated_at", { ascending: false }),
    sb.from("social_posts").select("id,kind,platform,title,caption,hashtags,status,scheduled_at,posted_at,post_media(id,mime_type,sort_order)").eq("client_id", cid).order("scheduled_at", { ascending: true, nullsFirst: false }),
    sb.from("invoices").select("id,period_label,amount,currency,status,issued_at,due_date,paid_at").eq("client_id", cid).order("issued_at", { ascending: false }),
    sb.from("documents").select("id,kind,title,status,created_at,signed_at,signed_by_name").eq("client_id", cid).order("created_at", { ascending: false }),
    sb.from("activity_log").select("id,detail,created_at").eq("client_id", cid).eq("client_visible", true).order("created_at", { ascending: false }).limit(12),
    sb.from("payment_plans").select("id,title,kind,currency,total_amount,recurring_amount,billing_interval,next_invoice_date,end_date,status,plan_installments(id,label,percent,amount,due_date,invoice_id,sort_order)").eq("client_id", cid).neq("status", "cancelled").order("created_at", { ascending: false }),
  ]);
  const todayIso = isoDay();
  const terms = client?.payment_terms_days ?? 7;
  const invById = new Map((invoices ?? []).map((i) => [i.id, i]));
  const lateRate = Number(client?.late_interest_percent ?? 0);

  const activeSubs = (subs ?? []).filter((s: any) => s.status === "active");
  const upcoming = (posts ?? []).filter((p) => p.status !== "posted");
  const published = (posts ?? []).filter((p) => p.status === "posted");
  const total = totals(activeSubs.map((s: any) => ({ amount: s.price_monthly, currency: s.currency })));
  const owed = totals((invoices ?? []).filter((i) => i.status === "due" || i.status === "overdue"));
  const doneCount = (work ?? []).filter((w) => w.status === "done").length;
  const pct = (work ?? []).length ? Math.round((doneCount / (work ?? []).length) * 100) : 0;
  const next = upcoming[0];
  const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const hasOwed = Object.keys(owed).length > 0;
  const toSign = (docs ?? []).filter((d) => d.kind === "contract" && d.status === "sent");

  const payable = (invoices ?? [])
    .filter((i) => i.status === "due" || i.status === "overdue")
    .map((i) => ({ ...i, dueOn: effectiveDueDate(i, terms) }))
    .sort((x, y) => (x.dueOn < y.dueOn ? -1 : 1));
  const firstPayable = payable[0];

  return (
    <div className="space-y-5">
      {payable.length > 0 && (
        <section className="card !border-lime !bg-lime-soft !p-4">
          <p className="tag !text-forest">[ Payment due ]</p>
          <div className="mt-2 space-y-2">
            {payable.slice(0, 3).map((i) => {
              const late = isOverdue(i.dueOn, todayIso);
              return (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0"><p className="truncate font-semibold">{i.period_label}</p><p className={`font-mono text-[11px] ${late ? "font-semibold text-red-700" : "text-forest/70"}`}>{late ? "Overdue · was due " : "Due "}{fmtDate(i.dueOn)}</p></div>
                  <div className="flex items-center gap-3"><span className="text-lg font-bold">{money(i.amount, i.currency)}</span><Link href={`/invoices/${i.id}/pay`} className="btn-primary !py-2.5">Pay now</Link></div>
                </div>
              );
            })}
            {payable.length > 3 && <p className="text-xs text-forest/80">+ {payable.length - 3} more in Billing history below.</p>}
          </div>
        </section>
      )}
      <section className="card-green relative overflow-hidden !p-6 sm:!p-8">
        <Corner className="absolute -right-3 -top-3 z-0 h-20 w-20 rotate-90 text-forest-deep sm:h-40 sm:w-40" />
        <div className="relative z-10">
          <p className="tag !text-lime">[ Your workspace ]</p>
          <h1 className="mt-2 max-w-[85%] text-3xl font-bold leading-[1.05] tracking-tight sm:max-w-md sm:text-4xl">{client?.business_name}</h1>
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div><p className="tag !text-paper/60">Your plan</p><Totals t={total} empty="None" className="text-2xl font-bold leading-snug" /><p className="text-sm font-medium text-paper/60">per month</p></div>
            <div><p className="tag !text-paper/60">Active services</p><p className="text-2xl font-bold">{activeSubs.length}</p></div>
            {hasOwed && <div><p className="tag !text-lime">Payment due</p><Totals t={owed} className="text-2xl font-bold leading-snug text-lime" /></div>}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {firstPayable && <Link href={`/invoices/${firstPayable.id}/pay`} className="btn-lime">Pay now</Link>}
            <Link href="/chat" className={firstPayable ? "btn !border !border-paper/30 !text-paper hover:!bg-paper/10" : "btn-lime"}>Chat with the team</Link>
            <Link href="/chat/ai" className="btn !border !border-paper/30 !text-paper hover:!bg-paper/10">Ask Anweo AI</Link>
          </div>
        </div>
      </section>

      {toSign.length > 0 && (
        <section className="card !border-lime !bg-lime-soft">
          <p className="tag !text-forest">[ Needs your attention ]</p>
          <p className="mt-1 font-semibold">{toSign.length === 1 ? "A contract is waiting for you to review and accept." : `${toSign.length} contracts are waiting for you to review and accept.`}</p>
          <p className="text-sm text-forest/80">Scroll to “Contracts & documents” below.</p>
        </section>
      )}

      <section className="card">
        <p className="tag mb-3">[ Next up ]</p>
        {next ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold capitalize">{next.kind} · {next.platform}</p>
              <span className={`pill ${statusPill(next.status)}`}>{label(next.status)}</span>
            </div>
            {next.caption && <p className="mt-2 line-clamp-3 text-sm text-ink/75">{next.caption}</p>}
            <p className="mt-2 font-mono text-xs text-mute">{next.scheduled_at ? fmtDate(next.scheduled_at, true) : "To be scheduled"}</p>
          </div>
        ) : <Empty>Nothing scheduled right now. We'll add your next post here.</Empty>}
      </section>

      <section className="card">
        <p className="tag mb-3">[ Your projects ]</p>
        <div className="grid gap-3 md:grid-cols-2">
          {(projects ?? []).length === 0 && <div className="md:col-span-2"><Empty>No projects yet.</Empty></div>}
          {(projects ?? []).map((p: any) => {
            const ms = [...(p.milestones ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
            const done = ms.filter((m: any) => m.done).length;
            const ppct = ms.length ? Math.round((done / ms.length) * 100) : p.status === "completed" ? 100 : 0;
            return (
              <div key={p.id} className="rounded-xl border border-edge bg-paper/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-semibold">{p.title}</p>{p.due_date && <p className="font-mono text-[11px] text-mute">Due {fmtDate(p.due_date)}</p>}</div>
                  <span className={`pill shrink-0 ${statusPill(p.status)}`}>{label(p.status)}</span>
                </div>
                {p.description && <p className="mt-2 text-sm text-ink/70">{p.description}</p>}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-forest-soft"><div className="h-full rounded-full bg-lime-deep" style={{ width: `${ppct}%` }} /></div>
                <p className="mt-1 font-mono text-[11px] text-mute">{ppct}% complete{ms.length ? ` · ${done}/${ms.length} milestones` : ""}</p>
                {ms.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {ms.map((m: any) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${m.done ? "bg-forest text-lime" : "border border-edge bg-white"}`}>{m.done ? "✓" : ""}</span>
                        <span className={m.done ? "text-mute line-through" : ""}>{m.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <p className="tag mb-3">[ Your services ]</p>
          <div className="space-y-2">
            {(subs ?? []).length === 0 && <Empty>No services yet.</Empty>}
            {(subs ?? []).map((s: any) => (
              <div key={s.id} className="row">
                <div className="min-w-0"><p className="truncate font-medium">{s.services?.name}</p><p className="font-mono text-[11px] text-mute">Since {day(s.start_date)}</p></div>
                <span className="flex items-center gap-2"><span className="font-semibold">{money(s.price_monthly, s.currency)}</span><span className={`pill ${statusPill(s.status)}`}>{s.status}</span></span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="mb-3 flex items-center justify-between"><p className="tag">[ Work in progress ]</p>{(work ?? []).length > 0 && <span className="font-mono text-xs text-forest">{pct}% done</span>}</div>
          {(work ?? []).length > 0 && <div className="mb-3 h-2 overflow-hidden rounded-full bg-forest-soft"><div className="h-full rounded-full bg-lime-deep" style={{ width: `${pct}%` }} /></div>}
          <div className="space-y-2">
            {(work ?? []).length === 0 && <Empty>No work items yet.</Empty>}
            {(work ?? []).map((w) => (
              <div key={w.id} className="row"><span className="min-w-0 truncate">{w.title}</span><span className={`pill shrink-0 ${statusPill(w.status)}`}>{label(w.status)}</span></div>
            ))}
          </div>
        </section>
      </div>

      {(plans ?? []).length > 0 && (
        <section className="card">
          <p className="tag mb-3">[ Your payment plan ]</p>
          <div className="grid gap-3 md:grid-cols-2">
            {(plans ?? []).map((p: any) => {
              const inst = [...(p.plan_installments ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
              return (
                <div key={p.id} className="rounded-xl border border-edge bg-paper/60 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-semibold">{p.title}</p>
                      <p className="font-mono text-[11px] uppercase text-mute">{p.kind === "one_time" ? `One-time · ${money(p.total_amount, p.currency)}` : `${money(p.recurring_amount, p.currency)} every ${intervalLabel[p.billing_interval]}`}</p></div>
                    {p.status === "paused" && <span className={`pill ${statusPill("paused")}`}>paused</span>}
                  </div>
                  {p.kind === "one_time" ? (
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {inst.map((x: any) => {
                        const inv: any = x.invoice_id ? invById.get(x.invoice_id) : null;
                        const due = inv ? effectiveDueDate(inv, terms) : x.due_date;
                        const state = inv ? (inv.status === "paid" ? "paid" : isOverdue(due, todayIso) ? "overdue" : "due") : "upcoming";
                        return (
                          <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                            <span className="min-w-0"><span className="font-medium">{x.label}</span> <span className="font-mono text-[11px] text-mute">· {Number(x.percent)}%</span>
                              <span className="block font-mono text-[11px] text-mute">{inv?.status === "paid" ? `Paid ${fmtDate(inv.paid_at)}` : due ? `Due ${fmtDate(due)}` : "Date to be confirmed"}</span></span>
                            <span className="flex items-center gap-2"><span className="font-semibold">{money(x.amount, p.currency)}</span><span className={`pill ${statusPill(state === "upcoming" ? "planning" : state)}`}>{state}</span></span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-lg bg-white px-3 py-2.5 font-mono text-[11px] text-mute">
                      {p.status === "completed" ? "This plan has finished." : `Next invoice ${fmtDate(p.next_invoice_date)}`}{p.end_date ? ` · ends ${fmtDate(p.end_date)}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card">
        <p className="tag mb-3">[ Contracts & documents ]</p>
        <div className="space-y-2">
          {(docs ?? []).length === 0 && <Empty>No documents shared with you yet.</Empty>}
          {(docs ?? []).map((d) => (
            <div key={d.id} className="rounded-xl border border-edge bg-paper/60 p-3.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="font-mono text-[11px] uppercase text-mute">{d.kind} · {fmtDate(d.created_at)}</p>
                </div>
                <span className="flex items-center gap-2">
                  {d.kind === "contract" && <span className={`pill ${statusPill(d.status)}`}>{d.status === "sent" ? "awaiting you" : d.status}</span>}
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-1.5 text-xs">View</a>
                </span>
              </div>
              {d.kind === "contract" && d.status === "signed" && (
                <p className="mt-2 text-xs text-forest">Accepted by {d.signed_by_name} on {fmtDate(d.signed_at, true)}.</p>
              )}
              {d.kind === "contract" && d.status === "sent" && (
                <Form action={signDocumentAction} className="mt-3 grid gap-2 border-t border-edge pt-3 sm:grid-cols-[1fr_auto]">
                  <input type="hidden" name="id" value={d.id} />
                  <div><label className="label">Type your full name to accept</label><input name="signer" required minLength={2} className="input" autoComplete="name" /></div>
                  <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" name="agree" required className="h-4 w-4 accent-forest" /> I have read this contract and I agree to it.</label>
                  <div className="sm:col-span-2"><button className="btn-primary">Accept contract</button></div>
                </Form>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <p className="tag mb-3">[ Approved content, coming up ]</p>
          <div className="space-y-3">
            {upcoming.length === 0 && <Empty>Nothing approved and waiting right now.</Empty>}
            {upcoming.map((p: any) => (
              <div key={p.id} className="overflow-hidden rounded-xl border border-edge bg-paper/60 text-sm">
                {(p.post_media ?? []).length > 0 && <PostThumb media={[...p.post_media].sort((a: any, b: any) => a.sort_order - b.sort_order)} kind={p.kind} className="aspect-[16/10] w-full" />}
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium capitalize">{p.title || `${p.kind} · ${p.platform}`}</span><span className={`pill ${statusPill(p.status)}`}>{label(p.status)}</span></div>
                  {p.caption && <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-ink/70">{p.caption}</p>}
                  {p.hashtags && <p className="mt-1 text-xs text-forest">{p.hashtags}</p>}
                  <p className="mt-1.5 font-mono text-[11px] text-mute">{p.kind} · {p.platform} · {p.scheduled_at ? fmtDate(p.scheduled_at, true) : "To be scheduled"}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <p className="tag mb-3">[ Published · {published.length} ]</p>
          <div className="space-y-2">
            {published.length === 0 && <Empty>Nothing published yet.</Empty>}
            {published.map((p) => (
              <div key={p.id} className="row"><span className="flex min-w-0 items-center gap-3">{(p as any).post_media?.length > 0 && <PostThumb media={(p as any).post_media} kind={p.kind} className="h-10 w-10 shrink-0 rounded-lg" />}<span className="min-w-0 truncate capitalize">{(p as any).title || `${p.kind} · ${p.platform}`}</span></span><span className="font-mono text-[11px] text-mute">{fmtDate(p.posted_at, true)}</span></div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <p className="tag mb-3">[ Billing history ]</p>
          <div className="space-y-2">
            {(invoices ?? []).length === 0 && <Empty>No invoices yet.</Empty>}
            {(invoices ?? []).map((i) => {
              const due = effectiveDueDate(i, terms);
              const late = (i.status === "due" || i.status === "overdue") && isOverdue(due, todayIso);
              return (
                <div key={i.id} className="row">
                  <div className="min-w-0"><p className="truncate">{i.period_label}</p>
                    <p className="font-mono text-[11px] text-mute">{i.status === "paid" ? `Paid ${fmtDate(i.paid_at)}` : `Due ${fmtDate(due)}`}</p></div>
                  <span className="flex shrink-0 items-center gap-2"><span className="font-semibold">{money(i.amount, i.currency)}</span><span className={`pill ${statusPill(late ? "overdue" : i.status)}`}>{late ? "overdue" : i.status}</span>{(i.status === "due" || i.status === "overdue") && <Link href={`/invoices/${i.id}/pay`} className="rounded-lg bg-lime px-2.5 py-1 text-xs font-semibold text-ink hover:bg-lime-deep">Pay now</Link>}<a href={`/invoices/${i.id}`} className="text-xs font-medium text-forest hover:underline">Invoice</a></span>
                </div>
              );
            })}
            <p className="pt-1 text-xs text-mute">Payments are due within {terms} days of the invoice date.{lateRate > 0 ? ` A late fee of ${lateRate}% of the unpaid amount is added for each full week a payment is overdue, after a ${client?.late_grace_days ?? 0}-day grace period.` : ""}</p>
          </div>
        </section>
        <section className="card">
          <p className="tag mb-3">[ History ]</p>
          {(history ?? []).length === 0 ? <Empty>Updates will appear here as we work.</Empty> : (
            <ol className="relative space-y-4 border-l border-edge pl-5">
              {(history ?? []).map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-lime-deep ring-4 ring-white" />
                  <p className="text-sm">{h.detail}</p>
                  <p className="font-mono text-[11px] text-mute">{fmtDate(h.created_at, true)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
