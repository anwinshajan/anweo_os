import Link from "next/link";
import { redirect } from "next/navigation";
import Form from "@/components/Form";
import PushToggle from "@/components/PushToggle";
import LocalTime from "@/components/LocalTime";
import Shell, { Empty, PageHead } from "@/components/Shell";
import { markNotificationsReadAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Notifications() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const sb = await supabaseServer();
  const { data } = await sb.from("notifications").select("id,title,body,url,read_at,created_at,priority").order("created_at", { ascending: false }).limit(60);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <Shell me={me}>
      <PageHead tag="Inbox" title="Notifications" sub={unread ? `${unread} unread` : "You're all caught up."}>
        {unread > 0 && <Form action={markNotificationsReadAction} quiet><button className="btn-ghost">Mark all as read</button></Form>}
      </PageHead>
      <div className="card mb-5 !p-4"><PushToggle /></div>
      <div className="space-y-2">
        {(data ?? []).length === 0 && <Empty>Nothing yet. Messages, tasks, approvals and invoices will show up here.</Empty>}
        {(data ?? []).map((n) => {
          const inner = (
            <>
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : n.priority ? "bg-red-500" : "bg-forest"}`} />
              <div className="min-w-0 flex-1">
                <p className={`truncate ${n.read_at ? "text-ink/70" : "font-semibold"}`}>{n.priority && <span className="mr-1.5 rounded bg-red-500 px-1.5 py-0.5 align-middle font-mono text-[9px] uppercase text-white">Priority</span>}{n.title}</p>
                {n.body && <p className="line-clamp-2 text-sm text-mute">{n.body}</p>}
                <p className="mt-0.5 font-mono text-[10px] uppercase text-mute"><LocalTime iso={n.created_at} /></p>
              </div>
            </>
          );
          return n.url
            ? <Link key={n.id} href={n.url} className="row !items-start hover:border-forest/40">{inner}</Link>
            : <div key={n.id} className="row !items-start">{inner}</div>;
        })}
      </div>
    </Shell>
  );
}
