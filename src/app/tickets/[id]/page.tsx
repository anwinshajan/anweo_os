import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import DeleteButton from "@/components/DeleteButton";
import Form from "@/components/Form";
import LocalTime from "@/components/LocalTime";
import Shell from "@/components/Shell";
import { clientTicketStatusAction, deleteTicketAction, replyTicketAction, updateTicketAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isAdminRole } from "@/lib/roles";
import { categoryLabel, isOpenStatus, priorityTone, statusLabel, statusTone, ticketRef, STATUSES } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseServer();
  const { data: t } = await sb.from("tickets").select("id,ticket_no,subject,category,priority,status,assigned_to,created_by,created_at,resolved_at,project_id,clients(business_name),projects(title)").eq("id", id).single();
  if (!t) notFound();
  const isClient = me.role === "client";
  const [{ data: msgs }, { data: people }] = await Promise.all([
    sb.from("ticket_messages").select("id,author_id,body,internal,created_at").eq("ticket_id", id).order("created_at"),
    sb.from("profiles").select("id,full_name,email,role").or(`id.in.(${[...new Set([t.assigned_to, t.created_by, ...(await sb.from("ticket_messages").select("author_id").eq("ticket_id", id)).data?.map((m) => m.author_id) ?? []].filter(Boolean))].join(",") || "00000000-0000-0000-0000-000000000000"})`),
  ]);
  const { data: staff } = isClient ? { data: [] as { id: string; full_name: string | null; email: string | null }[] } : await sb.from("profiles").select("id,full_name,email").neq("role", "client");
  const byId = new Map([...(people ?? []), ...(staff ?? [])].map((p: any) => [p.id, p]));
  const nameOf = (uid: string | null) => { const p: any = uid ? byId.get(uid) : null; return p ? (p.role === "client" ? `${p.full_name || p.email}` : isClient ? "Anweo team" : p.full_name || p.email) : "Someone"; };
  const open = isOpenStatus(t.status);

  return (
    <Shell me={me}>
      <Link href="/tickets" className="tag hover:text-forest">← {isClient ? "Support" : "Tickets"}</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-mute">{ticketRef(t.ticket_no)}</p>
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{t.subject}</h1>
          <p className="mt-1 text-sm text-mute">{!isClient && `${(t.clients as any)?.business_name} · `}{categoryLabel(t.category)}{(t.projects as any)?.title ? ` · ${(t.projects as any).title}` : ""} · opened <LocalTime iso={t.created_at} /></p>
        </div>
        <div className="flex items-center gap-2">
          {(t.priority === "high" || t.priority === "urgent") && <span className={`pill ${priorityTone[t.priority]}`}>{t.priority}</span>}
          <span className={`pill ${statusTone[t.status]}`}>{statusLabel(t.status)}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="space-y-3">
            {(msgs ?? []).map((m) => {
              const mine = m.author_id === me.id;
              return (
                <div key={m.id} className={`rounded-xl px-4 py-3 text-sm ${m.internal ? "border border-dashed border-amber-300 bg-amber-50" : mine ? "bg-forest-soft" : "border border-edge bg-white"}`}>
                  <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{nameOf(m.author_id)}{m.internal && <span className="pill ml-2 bg-amber-100 text-amber-800">internal note</span>}</span><span className="font-mono text-[10px] text-mute"><LocalTime iso={m.created_at} /></span></p>
                  <p className="mt-1 whitespace-pre-wrap text-ink/90">{m.body}</p>
                </div>
              );
            })}
          </div>

          {!open && isClient ? (
            <div className="card text-center text-sm"><p className="text-mute">This ticket is {statusLabel(t.status).toLowerCase()}. Need more help?</p>
              <Form action={clientTicketStatusAction} className="mt-3" quiet><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="open" /><button className="btn-ghost">Reopen this ticket</button></Form></div>
          ) : (
            <Form action={replyTicketAction} className="card space-y-3">
              <input type="hidden" name="ticket_id" value={id} />
              <textarea name="body" required rows={4} placeholder={isClient ? "Write a reply…" : "Reply to the client, or tick “internal note”…"} className="input" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {!isClient ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="internal" className="h-4 w-4 accent-forest" /> Internal note</label>
                    <select name="set_status" defaultValue="" className="input !w-auto !py-1.5 !text-xs" aria-label="Then set status"><option value="">Keep status</option><option value="in_progress">Then: in progress</option><option value="waiting_client">Then: waiting on client</option><option value="resolved">Then: resolved</option></select>
                  </div>
                ) : <span />}
                <button className="btn-primary">Send reply</button>
              </div>
            </Form>
          )}
          {isClient && open && (
            <Form action={clientTicketStatusAction} className="text-center" quiet><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="closed" /><button className="text-sm text-mute hover:text-forest hover:underline">This is sorted. Close the ticket</button></Form>
          )}
        </div>

        {!isClient && (
          <aside className="space-y-4">
            <Form action={updateTicketAction} className="card space-y-3">
              <input type="hidden" name="id" value={id} />
              <p className="tag">[ Handling ]</p>
              <div><label className="label">Status</label><select name="status" defaultValue={t.status} className="input">{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
              <div><label className="label">Priority</label><select name="priority" defaultValue={t.priority} className="input"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
              <div><label className="label">Assigned to</label><select name="assigned_to" defaultValue={t.assigned_to ?? ""} className="input"><option value="">Nobody yet</option>{(staff ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</select></div>
              <button className="btn-primary w-full">Save</button>
            </Form>
            {isAdminRole(me.role) && <Form action={deleteTicketAction} quiet><input type="hidden" name="id" value={id} /><DeleteButton label="Delete this ticket" message="Delete this ticket and its messages?" /></Form>}
          </aside>
        )}
      </div>
    </Shell>
  );
}
