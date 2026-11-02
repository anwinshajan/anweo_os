import Link from "next/link";
import Form from "@/components/Form";
import AddServiceForm from "@/components/AddServiceForm";
import { notFound, redirect } from "next/navigation";
import Shell, { Empty, Totals, fmtDate, label, money, statusPill, totals } from "@/components/Shell";
import UploadForm from "@/components/UploadForm";
import BillingTab from "./BillingTab";
import CountryCurrency from "@/components/CountryCurrency";
import CurrencySelect from "@/components/CurrencySelect";
import {
  addMilestoneAction, addPostAction, addWorkAction, assignServiceAction, createProjectAction,
  deleteDocumentAction, removeServiceAction, setClientStatusAction,
  setDocumentSharingAction, setProjectStatusAction, setWorkStatusAction, toggleMilestoneAction, updateClientAction,
} from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isAdminRole, isLeadRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "projects", label: "Projects" },
  { key: "documents", label: "Documents" },
  { key: "work", label: "Work & content" },
  { key: "billing", label: "Billing", adminOnly: true },
];

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const lead = isLeadRole(me.role);
  const admin = isAdminRole(me.role);
  const sb = await supabaseServer();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const visibleTabs = TABS.filter((t) => !t.adminOnly || admin);
  const tab = visibleTabs.some((t) => t.key === rawTab) ? (rawTab as string) : "overview";

  const { data: client } = await sb.from("clients").select("*").eq("id", id).single();
  if (!client) notFound();

  const { data: activeSubsAll } = lead
    ? await sb.from("client_services").select("price_monthly,currency").eq("client_id", id).eq("status", "active")
    : { data: [] as { price_monthly: number; currency: string }[] };
  const monthly = totals((activeSubsAll ?? []).map((s) => ({ amount: s.price_monthly, currency: s.currency })));

  return (
    <Shell me={me}>
      <div className="space-y-5">
        <div>
          <Link href="/" className="tag hover:text-forest">← All clients</Link>
          <div className="mt-3 flex items-start gap-3 sm:gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-forest text-xl font-bold text-lime sm:h-14 sm:w-14 sm:text-2xl">{client.business_name[0]?.toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">{client.business_name}{client.status === "archived" && <span className="pill ml-3 align-middle bg-charcoal/10 text-charcoal">archived</span>}</h1>
              <div className="mt-1 space-y-0.5 text-sm text-mute">
                {client.contact_name && <p>{client.contact_name}{client.country ? ` · ${client.country}` : ""}</p>}
                {client.email && <p className="break-all">{client.email}</p>}
                {client.phone && <p>{client.phone}</p>}
                <p className="font-mono text-[11px] text-forest">bills in {client.currency}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={`/chat/c/${id}`} className="btn-lime">Open chat</Link>
            {lead && <p className="text-sm text-mute">Monthly: {Object.keys(monthly).length ? <Totals t={monthly} className="inline font-bold text-forest" /> : <span className="font-medium text-ink/70">no monthly services yet</span>}</p>}
          </div>
        </div>

        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Client sections">
          {visibleTabs.map((t) => (
            <Link key={t.key} href={`/clients/${id}?tab=${t.key}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${tab === t.key ? "bg-forest text-paper" : "bg-white text-ink/70 hover:bg-forest-soft hover:text-forest border border-edge"}`}>{t.label}</Link>
          ))}
        </nav>

        {tab === "overview" && <Overview id={id} client={client} lead={lead} />}
        {tab === "projects" && <Projects id={id} admin={admin} client={client} />}
        {tab === "documents" && <Documents id={id} lead={lead} />}
        {tab === "work" && <WorkAndContent id={id} meCanSocial={lead || me.role === "social_manager" || me.can_manage_social} />}
        {tab === "billing" && admin && <BillingTab id={id} client={client} />}
      </div>
    </Shell>
  );
}

/* ----------------------------------------------------------------- Overview */
async function Overview({ id, client, lead }: { id: string; client: any; lead: boolean }) {
  const sb = await supabaseServer();
  const [{ data: services }, { data: packages }, { data: subs }] = await Promise.all([
    lead ? sb.from("services").select("id,name").eq("active", true).order("sort_order") : Promise.resolve({ data: [] as any[] }),
    lead ? sb.from("packages").select("id,service_id,name,price_monthly,currency,prices").eq("active", true).order("price_monthly") : Promise.resolve({ data: [] as any[] }),
    lead ? sb.from("client_services").select("id,price_monthly,currency,status,services(name),packages(name)").eq("client_id", id).order("created_at") : Promise.resolve({ data: [] as any[] }),
  ]);
  return (
    <>
      <section className="card">
        <p className="tag mb-3">[ Selected services ]</p>
        <div className="space-y-2">
          {!lead && <Empty>Service and pricing details are visible to managers and admins.</Empty>}
          {lead && (subs ?? []).length === 0 && <Empty>No services selected yet. Pick one below.</Empty>}
          {lead && (subs ?? []).map((s: any) => (
            <div key={s.id} className="row flex-wrap">
              <div className="min-w-0"><p className="font-medium">{s.services?.name}</p><p className="font-mono text-[11px] text-mute">{s.packages?.name ?? "Custom price"}</p></div>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{money(s.price_monthly, s.currency)}</span>
                <span className={`pill ${statusPill(s.status)}`}>{s.status}</span>
                {s.status === "active" && (
                  <Form action={removeServiceAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="client_id" value={id} /><button className="text-xs font-medium text-red-700 hover:underline">Cancel</button></Form>
                )}
              </span>
            </div>
          ))}
        </div>
        {lead && (services ?? []).length > 0 && <AddServiceForm clientId={id} currency={client.currency} services={services ?? []} packages={packages ?? []} />}
        {lead && (services ?? []).length === 0 && <p className="mt-4 text-sm text-mute">No services set up yet. Add them under Services first.</p>}
      </section>

      {lead && (
        <section className="card">
          <p className="tag mb-3">[ Client details ]</p>
          <Form action={updateClientAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={id} />
            <div><label className="label">Business name *</label><input name="business_name" required defaultValue={client.business_name} className="input" /></div>
            <div><label className="label">Contact person</label><input name="contact_name" defaultValue={client.contact_name ?? ""} className="input" /></div>
            <div><label className="label">Email</label><input name="email" type="email" defaultValue={client.email ?? ""} className="input" /></div>
            <div><label className="label">Phone / WhatsApp</label><input name="phone" defaultValue={client.phone ?? ""} className="input" /></div>
            <CountryCurrency defaultCountry={client.country ?? "India"} defaultCurrency={client.currency} />
            <div className="sm:col-span-2"><label className="label">Billing address (shown on invoices)</label><textarea name="address" rows={2} defaultValue={client.address ?? ""} className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Client tax ID (GSTIN / VAT, optional)</label><input name="tax_id" defaultValue={client.tax_id ?? ""} className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Internal notes</label><textarea name="notes" rows={3} defaultValue={client.notes ?? ""} className="input" /></div>
            <p className="text-xs text-mute sm:col-span-2">Changing the billing currency only affects new invoices and services. Existing ones keep the currency they were created in.</p>
            <div className="sm:col-span-2"><button className="btn-primary">Save details</button></div>
          </Form>
          <Form action={setClientStatusAction} className="mt-4 border-t border-edge pt-4">
            <input type="hidden" name="id" value={id} />
            <button name="status" value={client.status === "archived" ? "active" : "archived"} className="btn-ghost text-xs">{client.status === "archived" ? "Restore this client" : "Archive this client"}</button>
          </Form>
        </section>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- Projects */
async function Projects({ id, admin, client }: { id: string; admin: boolean; client: any }) {
  const sb = await supabaseServer();
  const { data: projects } = await sb.from("projects").select("id,title,description,status,start_date,due_date,visible_to_client,milestones(id,title,done,due_date,sort_order)").eq("client_id", id).order("created_at", { ascending: false });
  const { data: plans } = admin ? await sb.from("payment_plans").select("project_id,total_amount,currency,status,plan_installments(label,invoice_id,invoices(status))").not("project_id", "is", null).eq("client_id", id) : { data: [] as any[] };
  const planOf = new Map((plans ?? []).map((pl: any) => [pl.project_id, pl]));
  return (
    <>
      <div className="space-y-4">
        {(projects ?? []).length === 0 && <Empty>No projects yet. Create the first one below.</Empty>}
        {(projects ?? []).map((p: any) => {
          const ms = [...(p.milestones ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
          const done = ms.filter((m: any) => m.done).length;
          const pct = ms.length ? Math.round((done / ms.length) * 100) : p.status === "completed" ? 100 : 0;
          return (
            <section key={p.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold tracking-tight">{p.title}{!p.visible_to_client && <span className="ml-2 font-mono text-[10px] uppercase text-mute">internal</span>}</h2>
                  <p className="font-mono text-[11px] text-mute">{[p.start_date && `Start ${fmtDate(p.start_date)}`, p.due_date && `Due ${fmtDate(p.due_date)}`].filter(Boolean).join(" · ")}</p>
                </div>
                <Form action={setProjectStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="client_id" value={id} />
                  <select key={p.status} name="status" defaultValue={p.status} className="input !w-auto !py-1.5 !text-xs">{["planning", "in_progress", "review", "completed", "on_hold"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                  <button className="btn-ghost !px-3 !py-1.5 text-xs">Save</button>
                </Form>
              </div>
              {p.description && <p className="mt-2 text-sm text-ink/70">{p.description}</p>}
              {admin && (() => {
                const pl: any = planOf.get(p.id);
                if (!pl) return <p className="mt-2 text-xs text-mute">No price set. <Link href={`/clients/${id}?tab=billing`} className="font-medium text-forest hover:underline">Add payments in Billing →</Link></p>;
                const ins = pl.plan_installments ?? [];
                const paid = ins.filter((i: any) => i.invoices?.status === "paid").length;
                const sent = ins.filter((i: any) => i.invoice_id).length;
                return <p className="mt-2 text-sm"><span className="font-semibold">{money(pl.total_amount, pl.currency)}</span> <span className="text-mute">· {paid} of {ins.length} paid · {sent} invoiced · </span><Link href={`/clients/${id}?tab=billing`} className="text-xs font-medium text-forest hover:underline">Billing →</Link></p>;
              })()}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-forest-soft"><div className="h-full rounded-full bg-lime-deep" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 font-mono text-[11px] text-mute">{pct}% complete</p>
              <ul className="mt-3 space-y-1.5">
                {ms.map((m: any) => (
                  <li key={m.id}>
                    <Form action={toggleMilestoneAction} className="flex items-center gap-2.5 text-sm">
                      <input type="hidden" name="id" value={m.id} /><input type="hidden" name="client_id" value={id} />
                      <button name="done" value={m.done ? "false" : "true"} aria-label={m.done ? "Mark not done" : "Mark done"} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${m.done ? "bg-forest text-lime" : "border border-edge bg-white hover:border-forest"}`}>{m.done ? "✓" : ""}</button>
                      <span className={m.done ? "text-mute line-through" : ""}>{m.title}</span>
                      {m.due_date && <span className="font-mono text-[10px] text-mute">{fmtDate(m.due_date)}</span>}
                    </Form>
                  </li>
                ))}
              </ul>
              <Form action={addMilestoneAction} className="mt-4 grid gap-2 border-t border-edge pt-4 sm:grid-cols-[1fr_auto_auto]">
                <input type="hidden" name="project_id" value={p.id} /><input type="hidden" name="client_id" value={id} />
                <input name="title" required placeholder="Add a milestone" className="input" aria-label="Milestone" />
                <input name="due_date" type="date" className="input" aria-label="Due date" />
                <button className="btn-ghost">Add</button>
              </Form>
            </section>
          );
        })}
      </div>
      <section className="card">
        <p className="tag mb-3">[ New project ]</p>
        <Form action={createProjectAction} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="client_id" value={id} />
          <div className="sm:col-span-2"><label className="label">Title *</label><input name="title" required className="input" placeholder="e.g. Website redesign" /></div>
          <div><label className="label">Start</label><input name="start_date" type="date" className="input" /></div>
          <div><label className="label">Due</label><input name="due_date" type="date" className="input" /></div>
          <div className="sm:col-span-4"><label className="label">What's included</label><textarea name="description" rows={2} className="input" /></div>
          {admin && (
            <div className="grid gap-3 rounded-xl bg-paper/70 p-3 sm:col-span-4 sm:grid-cols-4">
              <div className="sm:col-span-4"><p className="font-semibold">Price (optional)</p><p className="text-xs text-mute">The advance is invoiced now. The rest is invoiced automatically when you mark the project completed.</p></div>
              <div className="sm:col-span-2"><label className="label">Total price</label><input name="price" type="number" min="0" step="0.01" placeholder="e.g. 60000" className="input" /></div>
              <div><label className="label">Currency</label><CurrencySelect short defaultValue={client.currency} /></div>
              <div><label className="label">Advance</label><select name="advance" defaultValue="50" className="input"><option value="0">None, pay on delivery</option><option value="30">30% now</option><option value="50">50% now</option><option value="70">70% now</option><option value="100">100% now</option></select></div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="visible" defaultChecked className="h-4 w-4 accent-forest" /> Show to the client</label>
          <div><button className="btn-primary w-full">Create project</button></div>
        </Form>
      </section>
    </>
  );
}

/* ----------------------------------------------------------------- Documents */
async function Documents({ id, lead }: { id: string; lead: boolean }) {
  const sb = await supabaseServer();
  const [{ data: docs }, { data: projects }] = await Promise.all([
    sb.from("documents").select("id,kind,title,file_name,status,visible_to_client,created_at,signed_at,signed_by_name,size_bytes").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("projects").select("id,title").eq("client_id", id),
  ]);
  const size = (b: number | null) => (b ? (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`) : "");
  return (
    <section className="card">
      <p className="tag mb-3">[ Contracts & documents ]</p>
      <div className="space-y-2">
        {(docs ?? []).length === 0 && <Empty>No documents yet. Upload a contract, proposal or assets below.</Empty>}
        {(docs ?? []).map((d: any) => (
          <div key={d.id} className="row flex-wrap">
            <div className="min-w-0">
              <p className="truncate font-medium">{d.title}</p>
              <p className="font-mono text-[11px] uppercase text-mute">{d.kind} · {fmtDate(d.created_at)} {size(d.size_bytes) && `· ${size(d.size_bytes)}`}{d.status === "signed" ? ` · accepted by ${d.signed_by_name}` : ""}</p>
            </div>
            <span className="flex flex-wrap items-center gap-2">
              {d.kind === "contract" && <span className={`pill ${statusPill(d.status)}`}>{d.status}</span>}
              <span className={`pill ${d.visible_to_client ? "bg-lime-soft text-forest" : "bg-charcoal/10 text-charcoal"}`}>{d.visible_to_client ? "shared" : "private"}</span>
              <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-1.5 text-xs">Open</a>
              {d.status !== "signed" && (d.kind !== "contract" || lead) && (
                <>
                  <Form action={setDocumentSharingAction}>
                    <input type="hidden" name="id" value={d.id} /><input type="hidden" name="client_id" value={id} />
                    <button name="share" value={d.visible_to_client ? "false" : "true"} className="text-xs font-medium text-forest hover:underline">{d.visible_to_client ? "Unshare" : "Share with client"}</button>
                  </Form>
                  <Form action={deleteDocumentAction}><input type="hidden" name="id" value={d.id} /><button className="text-xs font-medium text-red-700 hover:underline">Delete</button></Form>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <UploadForm clientId={id} canContract={lead} projects={(projects ?? []) as { id: string; title: string }[]} />
      <p className="mt-3 text-xs text-mute">Files are private. A client can only open what you've shared with them. When a contract is shared, they can read and accept it in their portal.</p>
    </section>
  );
}

/* ----------------------------------------------------------------- Work & content */
async function WorkAndContent({ id, meCanSocial }: { id: string; meCanSocial: boolean }) {
  const sb = await supabaseServer();
  const [{ data: work }, { data: posts }, { data: staff }] = await Promise.all([
    sb.from("work_items").select("id,title,status,due_date,visible_to_client,assignee").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("social_posts").select("id,kind,platform,caption,status,scheduled_at").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("profiles").select("id,full_name,email,role").neq("role", "client").eq("status", "active").order("full_name"),
  ]);
  const who = new Map((staff ?? []).map((s: any) => [s.id, s.full_name || s.email]));
  return (
    <>
      <section className="card">
        <p className="tag mb-3">[ Work ]</p>
        <div className="space-y-2">
          {(work ?? []).length === 0 && <Empty>No work items yet.</Empty>}
          {(work ?? []).map((w: any) => (
            <Form key={w.id} action={setWorkStatusAction} className="row flex-wrap">
              <input type="hidden" name="id" value={w.id} /><input type="hidden" name="client_id" value={id} />
              <div className="min-w-0"><p className="truncate">{w.title}{!w.visible_to_client && <span className="ml-2 font-mono text-[10px] uppercase text-mute">internal</span>}</p>
                <p className="font-mono text-[11px] text-mute">{w.assignee ? `→ ${who.get(w.assignee) ?? "someone"}` : "Unassigned"}{w.due_date ? ` · due ${fmtDate(w.due_date)}` : ""}</p></div>
              <span className="flex shrink-0 items-center gap-2">
                <select key={w.status} name="status" defaultValue={w.status} className="input !w-auto !py-1.5 !text-xs">{["todo", "in_progress", "review", "done"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                <button className="btn-ghost !px-3 !py-1.5 text-xs">Save</button>
              </span>
            </Form>
          ))}
        </div>
        <Form action={addWorkAction} className="mt-5 grid gap-3 border-t border-edge pt-5 sm:grid-cols-4">
          <input type="hidden" name="client_id" value={id} />
          <div className="sm:col-span-2"><label className="label">New task</label><input name="title" required className="input" /></div>
          <div><label className="label">Assign to</label>
            <select name="assignee" className="input"><option value="">Nobody yet</option>{(staff ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</select></div>
          <div><label className="label">Due</label><input name="due_date" type="date" className="input" /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="visible" defaultChecked className="h-4 w-4 accent-forest" /> Show to client</label>
          <div><button className="btn-primary w-full">Add task</button></div>
        </Form>
      </section>

      <section className="card">
        <p className="tag mb-3">[ Social content ]</p>
        <div className="space-y-2">
          {(posts ?? []).length === 0 && <Empty>No posts yet.</Empty>}
          {(posts ?? []).map((p: any) => (
            <div key={p.id} className="rounded-xl border border-edge bg-paper/60 p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium capitalize">{p.kind} · {p.platform}</span><span className={`pill ${statusPill(p.status)}`}>{label(p.status)}</span></div>
              {p.caption && <p className="mt-1.5 line-clamp-2 text-ink/70">{p.caption}</p>}
              <p className="mt-1.5 font-mono text-[11px] text-mute">{p.scheduled_at ? fmtDate(p.scheduled_at, true) : "No time set"}</p>
            </div>
          ))}
        </div>
        {meCanSocial ? (
          <Form action={addPostAction} className="mt-5 grid gap-3 border-t border-edge pt-5 sm:grid-cols-4">
            <input type="hidden" name="client_id" value={id} />
            <div><label className="label">Type</label><select name="kind" className="input"><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></div>
            <div><label className="label">Platform</label><select name="platform" className="input"><option>instagram</option><option>facebook</option><option>tiktok</option><option>linkedin</option></select></div>
            <div className="sm:col-span-2"><label className="label">Publish at</label><input name="scheduled_at" type="datetime-local" className="input" /></div>
            <div className="sm:col-span-4"><label className="label">Caption / script</label><textarea name="caption" rows={3} className="input" /></div>
            <div className="sm:col-span-4"><button className="btn-primary">Send for approval</button></div>
          </Form>
        ) : <p className="mt-4 text-xs text-mute">Only social media managers, managers and admins can create posts.</p>}
      </section>
    </>
  );
}
