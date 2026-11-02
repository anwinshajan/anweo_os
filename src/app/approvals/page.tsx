import { redirect } from "next/navigation";
import Form from "@/components/Form";
import Shell, { Empty, PageHead, label, statusPill } from "@/components/Shell";
import { reviewPostAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Approvals() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const lead = me.role === "admin" || me.role === "manager";
  const social = lead || me.role === "social_manager" || me.can_manage_social;
  const sb = await supabaseServer();

  const [{ data: waiting }, { data: ready }] = await Promise.all([
    sb.from("social_posts").select("id,kind,platform,caption,scheduled_at,clients(business_name)").eq("status", "awaiting_approval").order("scheduled_at", { nullsFirst: false }),
    sb.from("social_posts").select("id,kind,platform,caption,scheduled_at,status,clients(business_name)").in("status", ["approved", "scheduled"]).order("scheduled_at", { nullsFirst: false }),
  ]);
  const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "No time set");

  return (
    <Shell me={me}>
      <PageHead tag="Content" title="Approvals" sub="Review what the team prepared. Approve it, then post it and mark it as posted so the client sees it." />
      {!lead && <p className="mb-5 rounded-xl bg-forest-soft px-4 py-3 text-sm text-forest">Only admins and managers can approve posts. {social ? "Once a post is approved, you can mark it as posted." : "You can see the queue below."}</p>}

      <section className="mb-8">
        <p className="tag mb-3">[ Waiting for approval · {waiting?.length ?? 0} ]</p>
        <div className="space-y-3">
          {(waiting ?? []).length === 0 && <Empty>All clear. Nothing waiting.</Empty>}
          {(waiting ?? []).map((p: any) => (
            <div key={p.id} className="card !p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{p.clients?.business_name}</span>
                <span className="pill bg-forest-soft text-forest">{p.kind} · {p.platform}</span>
              </div>
              {p.caption && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-paper px-3.5 py-3 text-sm text-ink/85">{p.caption}</p>}
              <p className="mt-2 font-mono text-[11px] text-mute">{when(p.scheduled_at)}</p>
              {lead && (
                <Form action={reviewPostAction} className="mt-4 flex gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <button name="decision" value="approve" className="btn-primary flex-1 sm:flex-none">Approve</button>
                  <button name="decision" value="reject" className="btn-danger flex-1 sm:flex-none">Reject</button>
                </Form>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="tag mb-3">[ Approved, ready to post · {ready?.length ?? 0} ]</p>
        <div className="space-y-3">
          {(ready ?? []).length === 0 && <Empty>Nothing approved yet.</Empty>}
          {(ready ?? []).map((p: any) => (
            <div key={p.id} className="card !p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{p.clients?.business_name}</span>
                <span className={`pill ${statusPill(p.status)}`}>{label(p.status)}</span>
              </div>
              {p.caption && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-paper px-3.5 py-3 text-sm text-ink/85">{p.caption}</p>}
              <p className="mt-2 font-mono text-[11px] text-mute">{p.kind} · {p.platform} · {when(p.scheduled_at)}</p>
              {social && (
                <Form action={reviewPostAction} className="mt-4">
                  <input type="hidden" name="id" value={p.id} />
                  <button name="decision" value="posted" className="btn-lime">Mark as posted</button>
                </Form>
              )}
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
