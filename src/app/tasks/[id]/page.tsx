import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Shell, { PageHead, fmtDate } from "@/components/Shell";
import Form from "@/components/Form";
import { addWorkCommentAction, setWorkStatusAction, updateWorkDetailsAction } from "@/app/actions";
import { nameMap, visibleClients } from "@/lib/clients";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isLeadRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const STATUSES = ["todo", "in_progress", "review", "done"];
const label = (s: string) => s.replace("_", " ").replace(/^./, (c) => c.toUpperCase());

// One task: the brief, the deadline, its status and the conversation about it between the assignee and the managers.
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lead = isLeadRole(me.role);
  const sb = await supabaseServer();
  const { data: w } = await sb.from("work_items").select("id,client_id,title,details,status,due_date,assignee").eq("id", id).single();
  if (!w) notFound();
  const cn = nameMap(await visibleClients(sb));
  const [{ data: comments }, { data: people }] = await Promise.all([
    sb.from("work_comments").select("id,author_id,body,created_at").eq("work_id", id).order("created_at"),
    sb.from("profiles").select("id,full_name,email").neq("role", "client"),
  ]);
  const names = new Map((people ?? []).map((p: any) => [p.id, p.full_name || p.email || "Team member"]));
  const late = w.due_date && w.status !== "done" && w.due_date < new Date().toISOString().slice(0, 10);

  return (
    <Shell me={me}>
      <Link href="/tasks" className="tag hover:text-forest">← My tasks</Link>
      <div className="mt-3" />
      <PageHead tag={cn.get(w.client_id) ?? "Task"} title={w.title} sub={w.assignee ? `Assigned to ${names.get(w.assignee) ?? "someone"}` : "Not assigned yet"} />

      <section className="card mb-5">
        <Form action={setWorkStatusAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={w.id} /><input type="hidden" name="client_id" value={w.client_id} />
          <span className={`font-mono text-[11px] uppercase ${late ? "font-bold text-red-700" : "text-mute"}`}>{w.due_date ? `${late ? "Overdue · " : "Due "}${fmtDate(w.due_date)}` : "No deadline"}</span>
          <span className="flex-1" />
          <select key={w.status} name="status" defaultValue={w.status} className="input !w-auto !py-1.5 !text-sm">{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          <button className="btn-primary !py-1.5 text-sm">Update status</button>
        </Form>
      </section>

      <section className="card mb-5">
        <p className="tag mb-3">[ Brief ]</p>
        {lead ? (
          <Form action={updateWorkDetailsAction} className="space-y-3">
            <input type="hidden" name="id" value={w.id} />
            <textarea name="details" rows={6} defaultValue={w.details ?? ""} placeholder="What to make, sizes, tone, links, deadline notes…" className="input" />
            <button className="btn-ghost text-sm">Save brief</button>
          </Form>
        ) : w.details ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{w.details}</p>
        ) : (
          <p className="text-sm text-mute">No written brief yet. Ask in the comments below.</p>
        )}
        <p className="mt-3 text-xs text-mute">Brand kit, logos and files are on <Link href={`/clients/${w.client_id}`} className="font-medium text-forest hover:underline">the client page</Link>.</p>
      </section>

      <section className="card">
        <p className="tag mb-3">[ Comments · only the team sees these ]</p>
        <div className="space-y-3">
          {(comments ?? []).length === 0 && <p className="text-sm text-mute">No comments yet. Ask a question or share an update.</p>}
          {(comments ?? []).map((c: any) => (
            <div key={c.id} className={`rounded-xl px-3.5 py-2.5 text-sm ${c.author_id === me.id ? "bg-forest-soft" : "bg-white ring-1 ring-edge"}`}>
              <p className="mb-0.5 text-xs font-semibold text-forest">{c.author_id === me.id ? "You" : names.get(c.author_id) ?? "Team member"} <span className="font-mono font-normal text-mute">· {fmtDate(c.created_at)}</span></p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
        <Form action={addWorkCommentAction} className="mt-4 flex items-end gap-2">
          <input type="hidden" name="id" value={w.id} />
          <textarea name="body" rows={2} required maxLength={2000} placeholder="Write a comment…" className="input min-h-[44px] flex-1" />
          <button className="btn-primary">Send</button>
        </Form>
      </section>
    </Shell>
  );
}
