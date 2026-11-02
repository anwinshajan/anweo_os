import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, fmtDate, label } from "@/components/Shell";
import { setWorkStatusAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isLeadRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function Tasks() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const lead = isLeadRole(me.role);
  const sb = await supabaseServer();

  const [{ data: mine }, { data: unassigned }] = await Promise.all([
    sb.from("work_items").select("id,client_id,title,status,due_date,clients(business_name)").eq("assignee", me.id).order("due_date", { nullsFirst: false }),
    lead
      ? sb.from("work_items").select("id,client_id,title,status,due_date,clients(business_name)").is("assignee", null).neq("status", "done").order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const open = (mine ?? []).filter((t: any) => t.status !== "done");
  const done = (mine ?? []).filter((t: any) => t.status === "done").slice(0, 8);

  const Row = ({ t }: { t: any }) => (
    <form action={setWorkStatusAction} className="row flex-wrap">
      <input type="hidden" name="id" value={t.id} /><input type="hidden" name="client_id" value={t.client_id} />
      <div className="min-w-0">
        <p className="truncate font-medium">{t.title}</p>
        <p className="font-mono text-[11px] text-mute"><Link href={`/clients/${t.client_id}?tab=work`} className="hover:text-forest hover:underline">{t.clients?.business_name}</Link>{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ""}</p>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        <select key={t.status} name="status" defaultValue={t.status} className="input !w-auto !py-1.5 !text-xs">{["todo", "in_progress", "review", "done"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <button className="btn-ghost !px-3 !py-1.5 text-xs">Save</button>
      </span>
    </form>
  );

  return (
    <Shell me={me}>
      <PageHead tag="Work" title="My tasks" sub="Everything assigned to you across all clients." />
      <section className="mb-8">
        <p className="tag mb-3">[ To do · {open.length} ]</p>
        <div className="space-y-2">{open.length === 0 ? <Empty>You're all caught up.</Empty> : open.map((t: any) => <Row key={t.id} t={t} />)}</div>
      </section>
      {lead && (
        <section className="mb-8">
          <p className="tag mb-3">[ Unassigned · {unassigned?.length ?? 0} ]</p>
          <div className="space-y-2">{(unassigned ?? []).length === 0 ? <Empty>Nothing waiting to be assigned.</Empty> : (unassigned ?? []).map((t: any) => <Row key={t.id} t={t} />)}</div>
          <p className="mt-2 text-xs text-mute">Open a client's “Work & content” tab to assign tasks.</p>
        </section>
      )}
      {done.length > 0 && (
        <section>
          <p className="tag mb-3">[ Recently done ]</p>
          <div className="space-y-2">{done.map((t: any) => <Row key={t.id} t={t} />)}</div>
        </section>
      )}
    </Shell>
  );
}
