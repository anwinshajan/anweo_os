import Link from "next/link";
import Form from "@/components/Form";
import DeleteButton from "@/components/DeleteButton";
import CurrencySelect from "@/components/CurrencySelect";
import { Empty, fmtDate, label, money, statusPill } from "@/components/Shell";
import {
  addMilestoneAction, createProjectAction, deleteMilestoneAction, deleteProjectAction, deleteProjectUpdateAction, postProjectUpdateAction,
  setProjectStatusAction, toggleMilestoneAction, updateProjectAction,
} from "@/app/actions";
import LocalTime from "@/components/LocalTime";
import { supabaseServer } from "@/lib/supabase-server";
import { isoDay } from "@/lib/payments";

const STEPS = ["planning", "in_progress", "review", "completed"] as const;

export default async function ProjectsTab({ id, admin, client }: { id: string; admin: boolean; client: { currency: string } }) {
  const sb = await supabaseServer();
  const { data: projects } = await sb.from("projects").select("id,title,description,status,start_date,due_date,visible_to_client,milestones(id,title,done,due_date,sort_order)").eq("client_id", id).order("created_at", { ascending: false });
  const { data: plans } = admin
    ? await sb.from("payment_plans").select("project_id,total_amount,currency,plan_installments(label,invoice_id,invoices(status))").not("project_id", "is", null).eq("client_id", id)
    : { data: [] as any[] };
  const { data: updates } = await sb.from("project_updates").select("id,project_id,body,created_at,author_id").in("project_id", (projects ?? []).map((p: any) => p.id).concat(["00000000-0000-0000-0000-000000000000"])).order("created_at", { ascending: false });
  const { data: who } = await sb.from("profiles").select("id,full_name,email").neq("role", "client");
  const authorName = new Map((who ?? []).map((w) => [w.id, w.full_name || w.email]));
  const planOf = new Map((plans ?? []).map((pl: any) => [pl.project_id, pl]));
  const today = isoDay();
  const list = projects ?? [];
  const active = list.filter((p: any) => p.status !== "completed").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">{list.length === 0 ? "No projects yet" : `${active} in progress · ${list.length - active} completed`}</p>
      </div>

      <details className="card !p-0 open:shadow-lift" open={list.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">New project <span className="btn-lime !px-3 !py-1 text-xs">+ Add</span></summary>
        <Form action={createProjectAction} className="grid gap-3 border-t border-edge p-5 sm:grid-cols-4">
          <input type="hidden" name="client_id" value={id} />
          <div className="sm:col-span-4"><label className="label">Project name *</label><input name="title" required className="input" placeholder="e.g. Website redesign" /></div>
          <div className="sm:col-span-2"><label className="label">Start</label><input name="start_date" type="date" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Due</label><input name="due_date" type="date" className="input" /></div>
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
      </details>

      {list.length === 0 && <Empty>No projects yet. Create the first one above.</Empty>}

      {list.map((p: any) => {
        const ms = [...(p.milestones ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
        const done = ms.filter((m: any) => m.done).length;
        const pct = ms.length ? Math.round((done / ms.length) * 100) : p.status === "completed" ? 100 : 0;
        const late = p.due_date && p.status !== "completed" && p.due_date < today;
        const pl: any = planOf.get(p.id);
        const ins = pl?.plan_installments ?? [];
        const paid = ins.filter((i: any) => i.invoices?.status === "paid").length;
        const sent = ins.filter((i: any) => i.invoice_id).length;
        return (
          <section key={p.id} className="card !p-0 overflow-hidden">
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold leading-tight tracking-tight">{p.title}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-mute">
                    {p.start_date && <span>Start {fmtDate(p.start_date)}</span>}
                    {p.due_date && <span className={late ? "font-semibold text-red-700" : ""}>{late ? "Overdue · was due " : "Due "}{fmtDate(p.due_date)}</span>}
                    {!p.visible_to_client && <span className="uppercase">Internal</span>}
                  </p>
                </div>
                <span className={`pill ${statusPill(p.status)}`}>{label(p.status)}</span>
              </div>

              <Form action={setProjectStatusAction} className="-mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1" quiet>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="client_id" value={id} />
                {[...STEPS, ...(p.status === "on_hold" ? [] : ["on_hold" as const])].map((s) => (
                  <button key={s} name="status" value={s} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${p.status === s ? "border-forest bg-forest text-paper" : "border-edge bg-white text-ink/70 hover:border-forest/40"}`}>{label(s)}</button>
                ))}
                {p.status === "on_hold" && <span className="self-center pl-1 text-xs text-mute">On hold. Pick a step to resume.</span>}
              </Form>

              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-forest-soft"><div className="h-full rounded-full bg-lime-deep transition-all" style={{ width: `${pct}%` }} /></div>
                <span className="font-mono text-[11px] text-mute">{ms.length ? `${done}/${ms.length} · ` : ""}{pct}%</span>
              </div>

              {admin && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper/70 px-3.5 py-2.5 text-sm">
                  {pl ? (
                    <>
                      <span><span className="font-semibold">{money(pl.total_amount, pl.currency)}</span> <span className="text-mute">· {paid} of {ins.length} paid · {sent} invoiced</span></span>
                      <Link href={`/clients/${id}?tab=billing`} className="text-xs font-medium text-forest hover:underline">Payments →</Link>
                    </>
                  ) : (
                    <>
                      <span className="text-mute">No price set for this project</span>
                      <Link href={`/clients/${id}?tab=billing`} className="text-xs font-medium text-forest hover:underline">Add payments →</Link>
                    </>
                  )}
                </div>
              )}

              {p.description && <p className="mt-4 text-sm text-ink/75">{p.description}</p>}

              <div className="mt-4 rounded-xl border border-edge p-3.5">
                <p className="tag mb-2">Updates for the client{p.visible_to_client ? "" : " (project is internal, so they won't see these)"}</p>
                <Form action={postProjectUpdateAction} className="flex flex-wrap gap-2" quiet>
                  <input type="hidden" name="project_id" value={p.id} /><input type="hidden" name="client_id" value={id} />
                  <input name="body" required maxLength={2000} placeholder="e.g. Homepage design is ready for your review" className="input min-w-0 flex-1 basis-56" aria-label="Project update" />
                  <button className="btn-ghost">Post update</button>
                </Form>
                <div className="mt-3 space-y-2">
                  {(updates ?? []).filter((u: any) => u.project_id === p.id).slice(0, 4).map((u: any) => (
                    <div key={u.id} className="flex items-start justify-between gap-2 text-sm">
                      <p className="min-w-0"><span className="font-medium">{authorName.get(u.author_id) ?? "Team"}</span> <span className="font-mono text-[10px] text-mute"><LocalTime iso={u.created_at} /></span><br /><span className="whitespace-pre-wrap text-ink/80">{u.body}</span></p>
                      <Form action={deleteProjectUpdateAction} quiet><input type="hidden" name="id" value={u.id} /><input type="hidden" name="client_id" value={id} /><button aria-label="Remove update" className="px-1.5 text-mute hover:text-red-700">×</button></Form>
                    </div>
                  ))}
                  {(updates ?? []).every((u: any) => u.project_id !== p.id) && <p className="text-xs text-mute">No updates yet. Post one and the client gets a notification.</p>}
                </div>
              </div>

              <ul className="mt-4 space-y-1">
                {ms.map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <Form action={toggleMilestoneAction} className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-sm" quiet>
                      <input type="hidden" name="id" value={m.id} /><input type="hidden" name="client_id" value={id} />
                      <button name="done" value={m.done ? "false" : "true"} aria-label={m.done ? "Mark not done" : "Mark done"} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${m.done ? "border-forest bg-forest text-lime" : "border-edge bg-white text-transparent hover:border-forest"}`}>✓</button>
                      <span className={`truncate ${m.done ? "text-mute line-through" : ""}`}>{m.title}</span>
                      {m.due_date && <span className="shrink-0 font-mono text-[10px] text-mute">{fmtDate(m.due_date)}</span>}
                    </Form>
                    <Form action={deleteMilestoneAction} quiet><input type="hidden" name="id" value={m.id} /><input type="hidden" name="client_id" value={id} /><button aria-label="Remove milestone" className="px-1.5 text-mute hover:text-red-700">×</button></Form>
                  </li>
                ))}
              </ul>
              <Form action={addMilestoneAction} className="mt-3 flex flex-wrap gap-2" quiet>
                <input type="hidden" name="project_id" value={p.id} /><input type="hidden" name="client_id" value={id} />
                <input name="title" required placeholder="Add a step, e.g. Design approved" className="input min-w-0 flex-1 basis-48" aria-label="New milestone" />
                <input name="due_date" type="date" className="input !w-auto" aria-label="Milestone date" />
                <button className="btn-ghost">Add</button>
              </Form>
            </div>

            <details className="border-t border-edge bg-paper/50">
              <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-forest">Edit project</summary>
              <div className="px-5 pb-5">
                <Form action={updateProjectAction} className="grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="client_id" value={id} />
                  <div className="sm:col-span-4"><label className="label">Name</label><input name="title" required defaultValue={p.title} className="input" /></div>
                  <div className="sm:col-span-2"><label className="label">Start</label><input name="start_date" type="date" defaultValue={p.start_date ?? ""} className="input" /></div>
                  <div className="sm:col-span-2"><label className="label">Due</label><input name="due_date" type="date" defaultValue={p.due_date ?? ""} className="input" /></div>
                  <div className="sm:col-span-4"><label className="label">What's included</label><textarea name="description" rows={2} defaultValue={p.description ?? ""} className="input" /></div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="visible" defaultChecked={p.visible_to_client} className="h-4 w-4 accent-forest" /> Show to the client</label>
                  <div><button className="btn-primary w-full">Save</button></div>
                </Form>
                <Form action={deleteProjectAction} className="mt-4 border-t border-edge pt-3" quiet>
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="client_id" value={id} />
                  <DeleteButton label="Delete this project" message="Delete this project and its steps? Any payment plan stays in Billing." />
                </Form>
              </div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
