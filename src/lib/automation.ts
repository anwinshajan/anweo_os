import { supabaseAdmin } from "@/lib/supabase-server";
import { notifyUsers, snip } from "@/lib/notify";
import { dueDateFor, isTemplateDue, leastLoaded } from "@/lib/recurrence";

// Pick the person with the fewest open tasks among people in these roles (plus anyone with social access when the creative team is involved).
export async function pickAssignee(roles: string[]): Promise<string | null> {
  const admin = supabaseAdmin();
  let q = admin.from("profiles").select("id,role,can_manage_social,created_at").eq("status", "active").order("created_at");
  const social = roles.some((r) => ["social_manager", "marketing", "designer"].includes(r));
  q = social ? q.or(`role.in.(${roles.join(",")}),can_manage_social.eq.true`) : q.in("role", roles);
  const { data: people } = await q;
  const list = (people ?? []).filter((p) => p.role !== "client");
  if (list.length === 0) return null;
  const { data: open } = await admin.from("work_items").select("assignee").neq("status", "done").in("assignee", list.map((p) => p.id));
  const counts: Record<string, number> = {};
  for (const w of open ?? []) if (w.assignee) counts[w.assignee] = (counts[w.assignee] ?? 0) + 1;
  return leastLoaded(list, counts);
}

// Creates today's recurring tasks. Safe to run twice in a day: each template fires once.
export async function runTaskTemplates(today: string): Promise<number> {
  const admin = supabaseAdmin();
  const { data: templates } = await admin.from("task_templates").select("*,clients(business_name,status)").eq("active", true);
  let made = 0;
  for (const t of (templates ?? []) as any[]) {
    if (t.clients?.status !== "active" || !isTemplateDue(t, today)) continue;
    const assignee = t.assignee ?? (t.assignee_role ? await pickAssignee([t.assignee_role]) : null);
    const { error } = await admin.from("work_items").insert({
      client_id: t.client_id, title: t.title, assignee, due_date: dueDateFor(t, today), visible_to_client: false, auto_created: true, template_id: t.id,
    });
    if (error) { console.error("recurring task failed", t.id, error.message); continue; }
    await admin.from("task_templates").update({ last_run: today }).eq("id", t.id);
    if (assignee) await notifyUsers([assignee], { title: "New task from the system", body: snip(`${t.clients?.business_name}: ${t.title}`), url: "/tasks" });
    made++;
  }
  return made;
}
