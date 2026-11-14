import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { adminIds, clientUserIds, notifyUsers } from "@/lib/notify";
import { addDays, isoDay } from "@/lib/payments";
import { runTaskTemplates } from "@/lib/automation";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Runs every morning (see vercel.json). Creates every invoice that is due from recurring plans
// set to "automatic" and from dated instalments. It is safe to run twice: nothing is created twice.
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !same(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });

  const { data, error } = await supabaseAdmin().rpc("run_billing", { p_include_manual: false });
  if (error) {
    console.error("billing job failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Reminders: two days before an invoice is due, and the day after it was due. Each fires on exactly one day, so nobody is nagged twice.
  let reminders = 0;
  try {
    const admin = supabaseAdmin();
    const today = isoDay();
    const soon = addDays(today, 2), yesterday = addDays(today, -1);
    const { data: open } = await admin.from("invoices").select("client_id,period_label,amount,currency,due_date,clients(business_name)").in("status", ["due", "overdue"]).in("due_date", [soon, yesterday]);
    for (const inv of (open ?? []) as any[]) {
      const money = formatMoney(inv.amount, inv.currency);
      if (inv.due_date === soon) {
        await notifyUsers(await clientUserIds(inv.client_id), { title: "Invoice due in 2 days", body: `${inv.period_label} · ${money}`, url: "/" });
      } else {
        await notifyUsers(await clientUserIds(inv.client_id), { title: "Invoice overdue", body: `${inv.period_label} · ${money}`, url: "/" });
        await notifyUsers(await adminIds(), { title: "Invoice overdue", body: `${inv.clients?.business_name ?? "Client"} · ${inv.period_label} · ${money}`, url: "/finance" });
      }
      reminders++;
    }
  } catch (e) { console.error("reminders failed", e); }
  let tasks = 0;
  try { tasks = await runTaskTemplates(isoDay()); } catch (e) { console.error("recurring tasks failed", e); }
  // Sales: each owner gets one morning nudge listing how many prospects need a follow-up today.
  let followups = 0;
  try {
    const admin = supabaseAdmin();
    const { data: dueP } = await admin.from("prospects").select("assigned_to,created_by").lte("next_follow_up", isoDay()).not("status", "in", "(won,lost)");
    const per = new Map<string, number>();
    for (const p of (dueP ?? []) as any[]) { const o = p.assigned_to ?? p.created_by; if (o) per.set(o, (per.get(o) ?? 0) + 1); }
    for (const [uid, n] of per) { await notifyUsers([uid], { title: `${n} prospect${n === 1 ? "" : "s"} to follow up today`, body: "Open Growth to see who to message", url: "/growth" }); followups++; }
  } catch (e) { console.error("follow-up reminders failed", e); }
  // Team: one morning nudge per person for tasks due today or already overdue.
  let taskNudges = 0;
  try {
    const admin = supabaseAdmin();
    const today = isoDay();
    const { data: dueW } = await admin.from("work_items").select("assignee,due_date").lte("due_date", today).neq("status", "done").not("assignee", "is", null);
    const per = new Map<string, { today: number; late: number }>();
    for (const w of (dueW ?? []) as any[]) {
      const row = per.get(w.assignee) ?? { today: 0, late: 0 };
      if (w.due_date === today) row.today++; else row.late++;
      per.set(w.assignee, row);
    }
    for (const [uid, c] of per) {
      const parts = [c.today ? `${c.today} due today` : "", c.late ? `${c.late} overdue` : ""].filter(Boolean).join(" · ");
      await notifyUsers([uid], { title: "Tasks need your attention", body: parts, url: "/tasks", priority: c.late > 0 });
      taskNudges++;
    }
  } catch (e) { console.error("task reminders failed", e); }
  return NextResponse.json({ ok: true, taskNudges, followups, invoicesCreated: data, reminders, tasksCreated: tasks });
}
