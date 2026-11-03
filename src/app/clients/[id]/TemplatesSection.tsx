import DeleteButton from "@/components/DeleteButton";
import Form from "@/components/Form";
import { createTemplateAction, deleteTemplateAction, runTemplateNowAction, toggleTemplateAction } from "@/app/actions";
import { roleLabel } from "@/lib/roles";
import { supabaseServer } from "@/lib/supabase-server";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROLES = ["social_manager", "marketing", "designer", "developer", "manager"] as const;

// Tasks the system creates and hands out by itself, on a schedule, for this client.
export default async function TemplatesSection({ id }: { id: string }) {
  const sb = await supabaseServer();
  const [{ data: templates }, { data: staff }] = await Promise.all([
    sb.from("task_templates").select("id,title,cadence,weekday,day_of_month,assignee,assignee_role,due_in_days,active,last_run").eq("client_id", id).order("created_at"),
    sb.from("profiles").select("id,full_name,email").neq("role", "client").eq("status", "active").order("full_name"),
  ]);
  const name = (uid: string | null) => { const p = (staff ?? []).find((s) => s.id === uid); return p ? p.full_name || p.email : "someone"; };
  return (
    <section className="card">
      <p className="tag mb-1">[ Automatic tasks ]</p>
      <p className="mb-3 text-sm text-mute">The system creates these on schedule and gives each one to the right person. Pick a role and it goes to whoever has the fewest open tasks.</p>
      <div className="space-y-2">
        {(templates ?? []).length === 0 && <p className="text-sm text-mute">None yet. Try “Plan next month's content calendar”, monthly on the 25th, for your social manager role.</p>}
        {(templates ?? []).map((t) => (
          <div key={t.id} className={`row flex-wrap ${t.active ? "" : "opacity-60"}`}>
            <div className="min-w-0">
              <p className="truncate font-medium">{t.title}</p>
              <p className="font-mono text-[11px] text-mute">{t.cadence === "weekly" ? `Every ${DAYS[(t.weekday ?? 1) - 1]}` : `Monthly on day ${t.day_of_month}`} · due {t.due_in_days} day{t.due_in_days === 1 ? "" : "s"} later · for {t.assignee ? name(t.assignee) : `least busy ${roleLabel[t.assignee_role as keyof typeof roleLabel] ?? t.assignee_role}`}{t.last_run ? ` · last made ${t.last_run}` : ""}</p>
            </div>
            <span className="flex items-center gap-3">
              <Form action={runTemplateNowAction}><input type="hidden" name="id" value={t.id} /><button className="text-xs font-medium text-forest hover:underline">Create now</button></Form>
              <Form action={toggleTemplateAction} quiet><input type="hidden" name="id" value={t.id} /><input type="hidden" name="client_id" value={id} /><button name="active" value={t.active ? "false" : "true"} className="text-xs font-medium text-forest hover:underline">{t.active ? "Pause" : "Resume"}</button></Form>
              <Form action={deleteTemplateAction} quiet><input type="hidden" name="id" value={t.id} /><input type="hidden" name="client_id" value={id} /><DeleteButton label="Delete" message="Delete this automatic task?" /></Form>
            </span>
          </div>
        ))}
      </div>
      <Form action={createTemplateAction} className="mt-4 grid gap-3 border-t border-edge pt-4 sm:grid-cols-4">
        <input type="hidden" name="client_id" value={id} />
        <div className="sm:col-span-4"><label className="label">Task *</label><input name="title" required minLength={3} placeholder="e.g. Send the monthly report to the client" className="input" /></div>
        <div><label className="label">Repeats</label><select name="cadence" defaultValue="monthly" className="input"><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div>
        <div><label className="label">Weekday (weekly)</label><select name="weekday" defaultValue="1" className="input">{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></div>
        <div><label className="label">Day of month (monthly)</label><input name="day_of_month" type="number" min="1" max="28" defaultValue="1" className="input" /></div>
        <div><label className="label">Due after (days)</label><input name="due_in_days" type="number" min="0" max="60" defaultValue="3" className="input" /></div>
        <div className="sm:col-span-3"><label className="label">Give it to</label>
          <select name="assignee" defaultValue="role:social_manager" className="input">
            <optgroup label="Least busy person in a role">{ROLES.map((r) => <option key={r} value={`role:${r}`}>{roleLabel[r]}</option>)}</optgroup>
            <optgroup label="A specific person">{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</optgroup>
          </select></div>
        <div className="flex items-end"><button className="btn-primary w-full">Add automatic task</button></div>
      </Form>
    </section>
  );
}
