import Link from "next/link";
import MonthCalendar, { type CalPost } from "@/components/MonthCalendar";
import { supabaseServer } from "@/lib/supabase-server";

export default async function CalendarTab({ id, month, canEdit }: { id: string; month: string; canEdit: boolean }) {
  const sb = await supabaseServer();
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 8 * 86_400_000).toISOString();
  const to = new Date(Date.UTC(y, m, 1) + 8 * 86_400_000).toISOString();
  const cols = "id,title,caption,status,kind,platform,scheduled_at";
  const [{ data: a }, { data: b }] = await Promise.all([
    sb.from("social_posts").select(cols).eq("client_id", id).gte("scheduled_at", from).lt("scheduled_at", to).neq("status", "rejected"),
    sb.from("social_posts").select(cols).eq("client_id", id).is("scheduled_at", null).in("status", ["in_progress", "awaiting_approval", "approved"]).limit(30),
  ]);
  const posts: CalPost[] = [...(a ?? []), ...(b ?? [])].map((p: any) => ({ id: p.id, title: p.title || (p.caption ?? "").slice(0, 50), status: p.status, kind: p.kind, platform: p.platform, at: p.scheduled_at }));
  return (
    <div>
      <div className="mb-3 flex justify-end"><Link href="/studio" className="btn-ghost !py-2 text-xs">Open the studio</Link></div>
      <MonthCalendar posts={posts} month={month} hrefBase={`/clients/${id}?tab=calendar`} canEdit={canEdit} linkBase="/studio/" />
    </div>
  );
}
