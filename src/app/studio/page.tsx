import Link from "next/link";
import { redirect } from "next/navigation";
import Form from "@/components/Form";
import LocalDateTime from "@/components/LocalDateTime";
import PostThumb from "@/components/PostThumb";
import Shell, { Empty, PageHead } from "@/components/Shell";
import { savePostAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isLeadRole } from "@/lib/roles";
import { STAGES, stageOf, stageTone as tone } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function Studio({ searchParams }: { searchParams: Promise<{ stage?: string; client?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const sp = await searchParams;
  const sb = await supabaseServer();
  const lead = isLeadRole(me.role);
  const social = lead || ["social_manager", "marketing", "designer"].includes(me.role) || me.can_manage_social;

  const [{ data: posts }, { data: clients }, { data: staff }] = await Promise.all([
    sb.from("social_posts").select("id,client_id,kind,platform,title,caption,status,scheduled_at,created_by,updated_at,clients(business_name),post_media(id,mime_type,sort_order),post_comments(count)").order("updated_at", { ascending: false }).limit(300),
    sb.from("clients").select("id,business_name").eq("status", "active").order("business_name"),
    sb.from("profiles").select("id,full_name,email").neq("role", "client"),
  ]);
  const names = new Map((staff ?? []).map((p) => [p.id, p.full_name || p.email]));
  const all = (posts ?? []).filter((p: any) => !sp.client || p.client_id === sp.client);
  const counts: Record<string, number> = {};
  for (const p of all) { const k = stageOf(p.status).key; counts[k] = (counts[k] ?? 0) + 1; }
  const stage = STAGES.some((s) => s.key === sp.stage) ? sp.stage : "all";
  const shown = all.filter((p: any) => stage === "all" || stageOf(p.status).key === stage);
  const href = (st: string) => `/studio?${new URLSearchParams({ ...(st !== "all" ? { stage: st } : {}), ...(sp.client ? { client: sp.client } : {}) }).toString()}`;

  return (
    <Shell me={me}>
      <PageHead tag="Social" title="Studio" sub="Plan ideas, make posts, upload your work. Once a manager approves it, the client can see it.">
        <Link href="/calendar" className="btn-ghost">Calendar</Link>
      </PageHead>

      {social && (
        <details className="card mb-6 !p-0">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">New idea or post <span className="btn-lime !px-3 !py-1 text-xs">+ Add</span></summary>
          <Form action={savePostAction} className="grid gap-3 border-t border-edge p-5 sm:grid-cols-4">
            <div className="sm:col-span-2"><label className="label">Client *</label>
              <select name="client_id" required defaultValue={sp.client ?? ""} className="input"><option value="">Choose…</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select></div>
            <div><label className="label">Type</label><select name="kind" className="input"><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></div>
            <div><label className="label">Platform</label><select name="platform" className="input"><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="youtube">YouTube</option><option value="linkedin">LinkedIn</option><option value="whatsapp">WhatsApp</option></select></div>
            <div className="sm:col-span-4"><label className="label">Title or idea *</label><input name="title" required placeholder="e.g. Before/after bridal makeover reel" className="input" /></div>
            <div className="sm:col-span-4"><label className="label">Notes (internal, the client never sees these)</label><textarea name="notes" rows={2} placeholder="Hook, references, shots to capture…" className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Planned post time (optional)</label><LocalDateTime name="scheduled_at" /></div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <button name="stage" value="idea" className="btn-ghost flex-1">Save as idea</button>
              <button name="stage" value="draft" className="btn-primary flex-1">Start drafting</button>
            </div>
          </Form>
        </details>
      )}

      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        {stage !== "all" && <input type="hidden" name="stage" value={stage} />}
        <select name="client" defaultValue={sp.client ?? ""} className="input !w-auto min-w-[12rem]" aria-label="Filter by client"><option value="">All clients</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select>
        <button className="btn-ghost !py-2">Filter</button>
        {sp.client && <Link href={href(stage!)} className="text-sm text-forest hover:underline">Clear</Link>}
      </form>
      <nav className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {[{ key: "all", label: "All" }, ...STAGES].map((s) => {
          const n = s.key === "all" ? all.length : counts[s.key] ?? 0;
          const on = stage === s.key;
          return <Link key={s.key} href={href(s.key)} className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium ${on ? "border-forest bg-forest text-paper" : "border-edge bg-white hover:border-forest/40"}`}>{s.label} <span className={on ? "text-lime" : "text-mute"}>{n}</span></Link>;
        })}
      </nav>

      {shown.length === 0 ? (
        <Empty>{all.length === 0 ? "Nothing here yet. Add the first idea above." : "Nothing in this stage."}</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p: any) => {
            const st = stageOf(p.status);
            const cc = p.post_comments?.[0]?.count ?? 0;
            return (
              <Link key={p.id} href={`/studio/${p.id}`} className="card flex flex-col overflow-hidden !p-0 transition hover:-translate-y-0.5 hover:border-forest/40">
                <PostThumb media={[...(p.post_media ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)} kind={p.kind} className="aspect-[16/10] w-full" />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{p.clients?.business_name}</span><span className={`pill shrink-0 ${tone[st.key]}`}>{st.label}</span></div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-ink/80">{p.title || p.caption || "Untitled"}</p>
                  <p className="mt-auto pt-3 font-mono text-[10.5px] uppercase text-mute">{p.kind} · {p.platform} · {names.get(p.created_by) ?? "—"}{cc ? ` · ${cc} comment${cc === 1 ? "" : "s"}` : ""}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
