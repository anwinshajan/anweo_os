import Link from "next/link";
import { redirect } from "next/navigation";
import MonthCalendar, { type CalPost } from "@/components/MonthCalendar";
import Shell, { PageHead } from "@/components/Shell";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isLeadRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; client?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const sp = await searchParams;
  const now = new Date();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? sp.m! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, mo] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, mo - 1, 1) - 8 * 86_400_000).toISOString();
  const to = new Date(Date.UTC(y, mo, 1) + 8 * 86_400_000).toISOString();
  const sb = await supabaseServer();
  const social = isLeadRole(me.role) || ["social_manager", "marketing", "designer"].includes(me.role) || me.can_manage_social;

  let dated = sb.from("social_posts").select("id,title,caption,status,kind,platform,scheduled_at,client_id,clients(business_name)").gte("scheduled_at", from).lt("scheduled_at", to).neq("status", "rejected");
  let loose = sb.from("social_posts").select("id,title,caption,status,kind,platform,scheduled_at,client_id,clients(business_name)").is("scheduled_at", null).in("status", ["in_progress", "awaiting_approval", "approved"]).limit(30);
  if (sp.client) { dated = dated.eq("client_id", sp.client); loose = loose.eq("client_id", sp.client); }
  const [{ data: a }, { data: b }, { data: clients }] = await Promise.all([dated, loose, sb.from("clients").select("id,business_name").eq("status", "active").order("business_name")]);
  const posts: CalPost[] = [...(a ?? []), ...(b ?? [])].map((p: any) => ({ id: p.id, title: p.title || (p.caption ?? "").slice(0, 50), status: p.status, kind: p.kind, platform: p.platform, at: p.scheduled_at, client: p.clients?.business_name }));
  const base = `/calendar${sp.client ? `?client=${sp.client}` : ""}`;

  return (
    <Shell me={me}>
      <PageHead tag="Social" title="Content calendar" sub="Every client's posts on one calendar. Drag a post to move it.">
        <Link href="/studio" className="btn-ghost">Studio board</Link>
      </PageHead>
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="m" value={month} />
        <select name="client" defaultValue={sp.client ?? ""} className="input !w-auto min-w-[12rem]" aria-label="Client"><option value="">All clients</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select>
        <button className="btn-ghost !py-2">Filter</button>
      </form>
      <MonthCalendar posts={posts} month={month} hrefBase={base} canEdit={social} showClient={!sp.client} linkBase="/studio/" />
    </Shell>
  );
}
