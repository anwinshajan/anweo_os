import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, label, money, statusPill } from "@/components/Shell";
import { Corner, Logo } from "@/components/Logo";
import { createClientAction } from "./actions";
import { getMe, supabaseServer, type Me } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 text-center">
        <div className="mx-auto"><Logo /></div>
        <div className="card">
          <h1 className="text-xl font-bold">{me.status === "pending" ? "Awaiting approval" : "Account disabled"}</h1>
          <p className="mt-2 text-sm text-mute">
            {me.status === "pending"
              ? "Your account is created. A manager will activate it shortly."
              : "This account has been disabled. Please contact the Anweo team."}
          </p>
        </div>
      </main>
    );
  }
  const { q } = await searchParams;
  return <Shell me={me}>{me.role === "client" ? <ClientPortal me={me} /> : <StaffHome me={me} q={q ?? ""} />}</Shell>;
}

/* ---------------- Staff ---------------- */
async function StaffHome({ me, q }: { me: Me; q: string }) {
  const sb = await supabaseServer();
  const lead = me.role === "admin" || me.role === "manager";
  const term = q.replace(/[%_\\,()]/g, "").trim().slice(0, 60);

  let clientQuery = sb.from("clients").select("id,business_name,contact_name,country,status").order("created_at", { ascending: false });
  if (term) clientQuery = clientQuery.ilike("business_name", `%${term}%`);

  const [{ data: clients }, { data: subs }, { count: pending }, { data: due }] = await Promise.all([
    clientQuery,
    sb.from("client_services").select("client_id,price_monthly,currency,status,services(name)").eq("status", "active"),
    sb.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "awaiting_approval"),
    lead ? sb.from("invoices").select("amount,currency,status").in("status", ["due", "overdue"]) : Promise.resolve({ data: [] as { amount: number; currency: string; status: string }[] }),
  ]);

  const byClient = new Map<string, string[]>();
  (subs ?? []).forEach((s: any) => byClient.set(s.client_id, [...(byClient.get(s.client_id) ?? []), s.services?.name]));
  const mrr = (subs ?? []).filter((s: any) => s.currency === "GBP").reduce((a: number, s: any) => a + Number(s.price_monthly), 0);
  const outstanding = (due ?? []).filter((d) => d.currency === "GBP").reduce((a, d) => a + Number(d.amount), 0);

  return (
    <div className="space-y-6">
      <PageHead tag="Workspace" title="Clients" sub="Everyone Anweo is working for, and what they've signed up to." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tag="Clients" value={String(clients?.length ?? 0)} />
        <Stat tag="Needs approval" value={String(pending ?? 0)} href="/approvals" hot={(pending ?? 0) > 0} />
        {lead ? (
          <>
            <Stat tag="Monthly recurring" value={money(mrr)} green />
            <Stat tag="Outstanding" value={money(outstanding)} hot={outstanding > 0} />
          </>
        ) : (
          <Stat tag="Active services" value={String(subs?.length ?? 0)} />
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <form className="flex flex-1 gap-2" role="search">
          <input name="q" defaultValue={term} placeholder="Search clients" className="input" aria-label="Search clients" />
          <button className="btn-ghost">Search</button>
          {term && <Link href="/" className="btn-ghost">Clear</Link>}
        </form>
      </div>

      {lead && (
        <details className="card group">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
            <span>Add a client</span><span className="btn-lime !px-3 !py-1 text-xs group-open:hidden">+ New</span>
          </summary>
          <form action={createClientAction} className="mt-5 grid gap-3 sm:grid-cols-2">
            <div><label className="label">Business name *</label><input name="business_name" required className="input" /></div>
            <div><label className="label">Contact name</label><input name="contact_name" className="input" /></div>
            <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
            <div><label className="label">Phone / WhatsApp</label><input name="phone" className="input" /></div>
            <div><label className="label">Country</label>
              <select name="country" className="input"><option>India</option><option>United Kingdom</option><option>Other</option></select></div>
            <div className="flex items-end"><button className="btn-primary w-full">Create client</button></div>
          </form>
        </details>
      )}

      <section className="space-y-2.5">
        {(clients ?? []).length === 0 && <Empty>{term ? `No clients match “${term}”.` : "No clients yet. Add your first one above."}</Empty>}
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

function Stat({ tag, value, href, hot, green }: { tag: string; value: string; href?: string; hot?: boolean; green?: boolean }) {
  const body = (
    <div className={`${green ? "card-green" : "card"} !p-4 ${hot ? "ring-2 ring-lime" : ""} h-full`}>
      <p className={`tag ${green ? "!text-lime" : ""}`}>{tag}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/* ---------------- Client portal ---------------- */
async function ClientPortal({ me }: { me: Me }) {
  const sb = await supabaseServer();
  const cid = me.client_id!;
  const [{ data: client }, { data: subs }, { data: work }, { data: posts }, { data: invoices }, { data: history }] = await Promise.all([
    sb.from("clients").select("business_name").eq("id", cid).single(),
    sb.from("client_services").select("id,price_monthly,currency,status,start_date,services(name,description)").eq("client_id", cid).order("created_at"),
    sb.from("work_items").select("id,title,status,due_date,updated_at").eq("client_id", cid).order("updated_at", { ascending: false }),
    sb.from("social_posts").select("id,kind,platform,caption,status,scheduled_at,posted_at").eq("client_id", cid).order("scheduled_at", { ascending: true, nullsFirst: false }),
    sb.from("invoices").select("id,period_label,amount,currency,status,issued_at,paid_at").eq("client_id", cid).order("issued_at", { ascending: false }),
    sb.from("activity_log").select("id,detail,created_at").eq("client_id", cid).eq("client_visible", true).order("created_at", { ascending: false }).limit(12),
  ]);

  const activeSubs = (subs ?? []).filter((s: any) => s.status === "active");
  const upcoming = (posts ?? []).filter((p) => p.status !== "posted");
  const published = (posts ?? []).filter((p) => p.status === "posted");
  const total = activeSubs.reduce((a: number, s: any) => a + Number(s.price_monthly), 0);
  const cur = (activeSubs[0] as any)?.currency ?? "GBP";
  const owed = (invoices ?? []).filter((i) => i.status === "due" || i.status === "overdue").reduce((a, i) => a + Number(i.amount), 0);
  const doneCount = (work ?? []).filter((w) => w.status === "done").length;
  const pct = (work ?? []).length ? Math.round((doneCount / (work ?? []).length) * 100) : 0;
  const next = upcoming[0];
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "To be scheduled");
  const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="card-green relative overflow-hidden !p-6 sm:!p-8">
        <Corner className="absolute -right-3 -top-3 z-0 h-20 w-20 rotate-90 text-forest-deep sm:h-40 sm:w-40" />
        <div className="relative z-10">
          <p className="tag !text-lime">[ Your workspace ]</p>
          <h1 className="mt-2 max-w-[85%] text-3xl font-bold leading-[1.05] tracking-tight sm:max-w-md sm:text-4xl">{client?.business_name}</h1>
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div><p className="tag !text-paper/60">Your plan</p><p className="text-2xl font-bold">{money(total, cur)}<span className="text-sm font-medium text-paper/60"> / month</span></p></div>
            <div><p className="tag !text-paper/60">Active services</p><p className="text-2xl font-bold">{activeSubs.length}</p></div>
            {owed > 0 && <div><p className="tag !text-lime">Payment due</p><p className="text-2xl font-bold text-lime">{money(owed, cur)}</p></div>}
          </div>
        </div>
      </section>

      {/* Next up */}
      <section className="card">
        <p className="tag mb-3">[ Next up ]</p>
        {next ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold capitalize">{next.kind} · {next.platform}</p>
              <span className={`pill ${statusPill(next.status)}`}>{label(next.status)}</span>
            </div>
            {next.caption && <p className="mt-2 line-clamp-3 text-sm text-ink/75">{next.caption}</p>}
            <p className="mt-2 font-mono text-xs text-mute">{fmt(next.scheduled_at)}</p>
          </div>
        ) : <Empty>Nothing scheduled right now. We'll add your next post here.</Empty>}
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
          {(work ?? []).length > 0 && (
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-forest-soft"><div className="h-full rounded-full bg-lime-deep" style={{ width: `${pct}%` }} /></div>
          )}
          <div className="space-y-2">
            {(work ?? []).length === 0 && <Empty>No work items yet.</Empty>}
            {(work ?? []).map((w) => (
              <div key={w.id} className="row"><span className="min-w-0 truncate">{w.title}</span><span className={`pill shrink-0 ${statusPill(w.status)}`}>{label(w.status)}</span></div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <p className="tag mb-3">[ Upcoming content ]</p>
          <div className="space-y-2">
            {upcoming.length === 0 && <Empty>Nothing in the pipeline yet.</Empty>}
            {upcoming.map((p) => (
              <div key={p.id} className="rounded-xl border border-edge bg-paper/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium capitalize">{p.kind} · {p.platform}</span><span className={`pill ${statusPill(p.status)}`}>{label(p.status)}</span></div>
                {p.caption && <p className="mt-1.5 line-clamp-2 text-ink/70">{p.caption}</p>}
                <p className="mt-1.5 font-mono text-[11px] text-mute">{fmt(p.scheduled_at)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <p className="tag mb-3">[ Published · {published.length} ]</p>
          <div className="space-y-2">
            {published.length === 0 && <Empty>Nothing published yet.</Empty>}
            {published.map((p) => (
              <div key={p.id} className="row"><span className="capitalize">{p.kind} · {p.platform}</span><span className="font-mono text-[11px] text-mute">{fmt(p.posted_at)}</span></div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <p className="tag mb-3">[ Billing history ]</p>
          <div className="space-y-2">
            {(invoices ?? []).length === 0 && <Empty>No invoices yet.</Empty>}
            {(invoices ?? []).map((i) => (
              <div key={i.id} className="row"><span>{i.period_label}</span><span className="flex items-center gap-2"><span className="font-semibold">{money(i.amount, i.currency)}</span><span className={`pill ${statusPill(i.status)}`}>{i.status}</span></span></div>
            ))}
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
                  <p className="font-mono text-[11px] text-mute">{new Date(h.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
