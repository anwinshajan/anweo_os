import Link from "next/link";
import { redirect } from "next/navigation";
import Form from "@/components/Form";
import LocalTime from "@/components/LocalTime";
import Shell, { Empty, PageHead } from "@/components/Shell";
import { createTicketAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { CATEGORIES, STATUSES, categoryLabel, isOpenStatus, priorityTone, statusLabel, statusTone, ticketRef } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function Tickets({ searchParams }: { searchParams: Promise<{ status?: string; client?: string; mine?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const sp = await searchParams;
  const isClient = me.role === "client";
  const sb = await supabaseServer();

  const [{ data: all }, { data: clients }, { data: projects }] = await Promise.all([
    sb.from("tickets").select("id,ticket_no,subject,category,priority,status,assigned_to,client_id,updated_at,clients(business_name)").order("updated_at", { ascending: false }).limit(300),
    isClient ? Promise.resolve({ data: [] as { id: string; business_name: string }[] }) : sb.from("clients").select("id,business_name").eq("status", "active").order("business_name"),
    sb.from("projects").select("id,title,client_id").order("created_at", { ascending: false }),
  ]);
  const { data: staff } = isClient ? { data: [] as { id: string; full_name: string | null; email: string | null }[] } : await sb.from("profiles").select("id,full_name,email").neq("role", "client");
  const names = new Map((staff ?? []).map((p) => [p.id, p.full_name || p.email]));

  const list = (all ?? []).filter((t: any) => (!sp.client || t.client_id === sp.client) && (sp.mine !== "1" || t.assigned_to === me.id));
  const counts: Record<string, number> = {};
  for (const t of list) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const openCount = list.filter((t: any) => isOpenStatus(t.status)).length;
  const filter = sp.status ?? (isClient ? "all" : "active");
  const shown = list.filter((t: any) => filter === "all" ? true : filter === "active" ? isOpenStatus(t.status) : t.status === filter);
  const href = (st: string) => `/tickets?${new URLSearchParams({ ...(st !== "active" ? { status: st } : {}), ...(sp.client ? { client: sp.client } : {}), ...(sp.mine ? { mine: sp.mine } : {}) }).toString()}`;

  return (
    <Shell me={me}>
      <PageHead tag={isClient ? "Support" : "Inbox"} title={isClient ? "Support tickets" : "Tickets"} sub={isClient ? "Need something fixed, changed or built? Tell us here and we'll reply." : `${openCount} open`} />

      <details className="card mb-6 !p-0" open={isClient && list.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">{isClient ? "Raise a new ticket" : "Open a ticket for a client"} <span className="btn-lime !px-3 !py-1 text-xs">+ New</span></summary>
        <Form action={createTicketAction} className="grid gap-3 border-t border-edge p-5 sm:grid-cols-2">
          {!isClient && <div className="sm:col-span-2"><label className="label">Client *</label><select name="client_id" required className="input"><option value="">Choose…</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select></div>}
          <div className="sm:col-span-2"><label className="label">What do you need? *</label><input name="subject" required minLength={3} maxLength={140} placeholder="e.g. Please change the phone number on the website" className="input" /></div>
          <div><label className="label">Type</label><select name="category" className="input">{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
          <div><label className="label">Related project (optional)</label><select name="project_id" className="input"><option value="">None</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="label">Details *</label><textarea name="body" required rows={4} placeholder="Tell us what's happening, what you expected, and any links or page names." className="input" /></div>
          {isClient
            ? <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="urgent" className="h-4 w-4 accent-forest" /> This is urgent (something important is broken)</label>
            : <div><label className="label">Priority</label><select name="priority" defaultValue="normal" className="input"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>}
          <div className="sm:col-span-2"><button className="btn-primary w-full sm:w-auto">Send ticket</button></div>
        </Form>
      </details>

      {!isClient && (
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <select name="client" defaultValue={sp.client ?? ""} className="input !w-auto min-w-[12rem]" aria-label="Client"><option value="">All clients</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="h-4 w-4 accent-forest" /> Assigned to me</label>
          <button className="btn-ghost !py-2">Filter</button>
        </form>
      )}
      <nav className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {[{ key: "active", label: "Open" }, ...STATUSES.filter((s) => s.key !== "open"), { key: "all", label: "All" }].map((s) => (
          <Link key={s.key} href={href(s.key)} className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium ${filter === s.key ? "border-forest bg-forest text-paper" : "border-edge bg-white hover:border-forest/40"}`}>{s.label}{s.key !== "all" && s.key !== "active" ? <span className={filter === s.key ? " text-lime" : " text-mute"}> {counts[s.key] ?? 0}</span> : null}</Link>
        ))}
      </nav>

      <div className="space-y-2">
        {shown.length === 0 && <Empty>{list.length === 0 ? (isClient ? "No tickets yet. If something needs fixing or changing, raise one above." : "No tickets yet.") : "Nothing in this view."}</Empty>}
        {shown.map((t: any) => (
          <Link key={t.id} href={`/tickets/${t.id}`} className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 !p-4 transition hover:border-forest/40">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold"><span className="mr-2 font-mono text-xs text-mute">{ticketRef(t.ticket_no)}</span>{t.subject}</p>
              <p className="mt-0.5 font-mono text-[11px] uppercase text-mute">{!isClient && `${t.clients?.business_name} · `}{categoryLabel(t.category)}{t.assigned_to && !isClient ? ` · ${names.get(t.assigned_to) ?? "assigned"}` : ""} · <LocalTime iso={t.updated_at} /></p>
            </div>
            <div className="flex items-center gap-2">
              {(t.priority === "high" || t.priority === "urgent") && <span className={`pill ${priorityTone[t.priority]}`}>{t.priority}</span>}
              <span className={`pill ${statusTone[t.status]}`}>{statusLabel(t.status)}</span>
            </div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
