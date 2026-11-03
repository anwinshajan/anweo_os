import Link from "next/link";
import Form from "@/components/Form";
import AddServiceForm from "@/components/AddServiceForm";
import { notFound, redirect } from "next/navigation";
import Shell, { Empty, Totals, fmtDate, label, money, statusPill, totals } from "@/components/Shell";
import UploadForm from "@/components/UploadForm";
import BillingTab from "./BillingTab";
import ProjectsTab from "./ProjectsTab";
import HistoryTab from "./HistoryTab";
import CalendarTab from "./CalendarTab";
import MarketingTab from "./MarketingTab";
import LeadsTab from "./LeadsTab";
import TemplatesSection from "./TemplatesSection";
import { headers } from "next/headers";
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
  { key: "calendar", label: "Calendar" },
  { key: "marketing", label: "Marketing" },
  { key: "leads", label: "Leads" },
  { key: "documents", label: "Documents" },
  { key: "work", label: "Work & content" },
  { key: "billing", label: "Billing", adminOnly: true },
  { key: "history", label: "History", adminOnly: true },
];

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; m?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const lead = isLeadRole(me.role);
  const admin = isAdminRole(me.role);
  const sb = await supabaseServer();
  const { id } = await params;
  const sp = await searchParams;
  const rawTab = sp.tab;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;
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
            {lead && <div className="flex items-center gap-2 text-sm text-mute"><span>Monthly:</span>{Object.keys(monthly).length ? <Totals t={monthly} className="font-bold text-forest" /> : <span className="font-medium text-ink/70">no monthly services yet</span>}</div>}
          </div>
        </div>

        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Client sections">
          {visibleTabs.map((t) => (
            <Link key={t.key} href={`/clients/${id}?tab=${t.key}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${tab === t.key ? "bg-forest text-paper" : "bg-white text-ink/70 hover:bg-forest-soft hover:text-forest border border-edge"}`}>{t.label}</Link>
          ))}
        </nav>

        {tab === "overview" && <Overview id={id} client={client} lead={lead} admin={admin} />}
        {tab === "projects" && <ProjectsTab id={id} admin={admin} client={client} />}
        {tab === "documents" && <Documents id={id} lead={lead} />}
        {tab === "work" && <WorkAndContent id={id} meCanSocial={lead || me.role === "social_manager" || me.can_manage_social} />}
        {tab === "work" && lead && <TemplatesSection id={id} />}
        {tab === "billing" && admin && <BillingTab id={id} client={client} />}
        {tab === "calendar" && <CalendarTab id={id} month={/^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? sp.m! : new Date().toISOString().slice(0, 7)} canEdit={lead || me.role === "social_manager" || me.role === "marketing" || me.role === "designer" || me.can_manage_social} />}
        {tab === "marketing" && <MarketingTab id={id} currency={client.currency} canEdit={lead || me.role === "social_manager" || me.role === "marketing" || me.role === "designer" || me.can_manage_social} origin={origin} />}
        {tab === "leads" && <LeadsTab id={id} currency={client.currency} />}
        {tab === "history" && admin && <HistoryTab id={id} />}
      </div>
    </Shell>
  );
}

/* ----------------------------------------------------------------- Overview */
async function Overview({ id, client, lead, admin }: { id: string; client: any; lead: boolean; admin: boolean }) {
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
        {lead && (services ?? []).length > 0 && <AddServiceForm clientId={id} currency={client.currency} services={services ?? []} packages={packages ?? []} canPrice={admin} />}
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
                <select key={w.assignee ?? "none"} name="assignee" defaultValue={w.assignee ?? ""} className="input !w-auto max-w-[9rem] !py-1.5 !text-xs" aria-label="Assigned to"><option value="">Unassigned</option>{(staff ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select>
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
