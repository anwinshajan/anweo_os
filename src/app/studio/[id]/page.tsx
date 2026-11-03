import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import DeleteButton from "@/components/DeleteButton";
import Form from "@/components/Form";
import LocalDateTime from "@/components/LocalDateTime";
import LocalTime from "@/components/LocalTime";
import MediaUploader from "@/components/MediaUploader";
import Shell from "@/components/Shell";
import {
  addPostCommentAction, deletePostAction, deletePostMediaAction, reviewPostAction, savePostAction, setPostStageAction,
} from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isLeadRole } from "@/lib/roles";
import { STAGES, stageOf, stageTone } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseServer();
  const { data: p } = await sb.from("social_posts").select("*,clients(business_name)").eq("id", id).single();
  if (!p) notFound();
  const [{ data: media }, { data: comments }, { data: staff }] = await Promise.all([
    sb.from("post_media").select("id,file_name,mime_type,size_bytes,sort_order").eq("post_id", id).order("sort_order"),
    sb.from("post_comments").select("id,author_id,body,created_at").eq("post_id", id).order("created_at"),
    sb.from("profiles").select("id,full_name,email").neq("role", "client"),
  ]);
  const names = new Map((staff ?? []).map((s) => [s.id, s.full_name || s.email]));
  const lead = isLeadRole(me.role);
  const social = lead || ["social_manager", "marketing", "designer"].includes(me.role) || me.can_manage_social;
  const st = stageOf(p.status);
  const editable = social && p.status !== "posted";
  const cover = media?.[0];
  const tags = (p.hashtags ?? "").trim();

  return (
    <Shell me={me}>
      <Link href="/studio" className="tag hover:text-forest">← Studio</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{p.title || "Untitled"}</h1>
          <p className="mt-1 text-sm text-mute">{p.clients?.business_name} · {p.kind} · {p.platform}{p.created_by ? ` · by ${names.get(p.created_by) ?? "team"}` : ""}</p>
        </div>
        <span className={`pill ${stageTone[st.key]}`}>{st.label}</span>
      </div>

      <ol className="mt-5 flex gap-1 overflow-x-auto pb-1 text-xs">
        {STAGES.filter((s) => s.key !== "changes").map((s, i, arr) => {
          const cur = s.key === st.key || (st.key === "changes" && s.key === "draft");
          const idx = arr.findIndex((x) => x.key === (st.key === "changes" ? "draft" : st.key));
          return <li key={s.key} className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium ${cur ? "bg-forest text-paper" : i < idx ? "bg-lime-soft text-forest" : "bg-white text-mute border border-edge"}`}>{s.label}</li>;
        })}
      </ol>

      {p.status === "rejected" && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Changes requested</p><p className="mt-1 whitespace-pre-wrap">{p.review_note || "The reviewer asked for changes. See the comments below."}</p></div>
      )}
      {p.status === "approved" || p.status === "scheduled" ? <p className="mt-4 rounded-xl bg-lime-soft p-4 text-sm text-forest">Approved. The client can see this now.{!lead && " If you edit the caption it goes back for review."}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card">
            <p className="tag mb-3">[ Content ]</p>
            {editable ? (
              <Form action={savePostAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <div className="sm:col-span-2"><label className="label">Title</label><input name="title" defaultValue={p.title ?? ""} className="input" /></div>
                <div><label className="label">Type</label><select name="kind" defaultValue={p.kind} className="input"><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></div>
                <div><label className="label">Platform</label><select name="platform" defaultValue={p.platform} className="input">{["instagram", "facebook", "youtube", "linkedin", "whatsapp"].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select></div>
                <div className="sm:col-span-2"><label className="label">Caption</label><textarea name="caption" rows={6} defaultValue={p.caption ?? ""} placeholder="Write the caption the client will see…" className="input" /></div>
                <div className="sm:col-span-2"><label className="label">Hashtags</label><input name="hashtags" defaultValue={p.hashtags ?? ""} placeholder="#salon #bridal #kochi" className="input" /></div>
                <div className="sm:col-span-2"><label className="label">Planned post time</label><LocalDateTime name="scheduled_at" defaultIso={p.scheduled_at} /></div>
                <div className="sm:col-span-2"><label className="label">Internal notes (never shown to the client)</label><textarea name="notes" rows={3} defaultValue={p.notes ?? ""} className="input" /></div>
                <div className="sm:col-span-2"><button className="btn-primary">Save changes</button></div>
              </Form>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{p.caption || <span className="text-mute">No caption.</span>}</p>
                {tags && <p className="text-forest">{tags}</p>}
                {p.notes && <p className="rounded-xl bg-paper p-3 text-mute"><span className="tag block">Internal notes</span>{p.notes}</p>}
              </div>
            )}
          </section>

          <section className="card">
            <p className="tag mb-3">[ Your work · {media?.length ?? 0} file{media?.length === 1 ? "" : "s"} ]</p>
            {(media ?? []).length > 0 && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(media ?? []).map((m) => (
                  <div key={m.id} className="group relative overflow-hidden rounded-xl border border-edge bg-paper">
                    {m.mime_type?.startsWith("video/")
                      ? <video src={`/api/media/${m.id}`} controls preload="metadata" playsInline className="aspect-square w-full bg-ink object-contain" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <a href={`/api/media/${m.id}`} target="_blank" rel="noreferrer"><img src={`/api/media/${m.id}`} alt={m.file_name ?? ""} loading="lazy" className="aspect-square w-full object-cover" /></a>}
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5"><span className="truncate font-mono text-[10px] text-mute">{m.file_name}</span>
                      {editable && <Form action={deletePostMediaAction} quiet><input type="hidden" name="id" value={m.id} /><DeleteButton label="Remove" message="Remove this file?" /></Form>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {editable ? <MediaUploader postId={id} /> : (media ?? []).length === 0 && <p className="text-sm text-mute">No files uploaded.</p>}
          </section>

          <section className="card">
            <p className="tag mb-3">[ Team comments · {comments?.length ?? 0} ]</p>
            <div className="space-y-3">
              {(comments ?? []).length === 0 && <p className="text-sm text-mute">No comments yet. Use this for feedback between the team. Clients can't see it.</p>}
              {(comments ?? []).map((c) => (
                <div key={c.id} className="rounded-xl bg-paper px-3.5 py-2.5 text-sm">
                  <p className="flex justify-between gap-2"><span className="font-semibold">{names.get(c.author_id ?? "") ?? "Team"}</span><span className="font-mono text-[10px] text-mute"><LocalTime iso={c.created_at} /></span></p>
                  <p className="mt-0.5 whitespace-pre-wrap text-ink/85">{c.body}</p>
                </div>
              ))}
            </div>
            <Form action={addPostCommentAction} className="mt-3 flex gap-2" quiet>
              <input type="hidden" name="post_id" value={id} />
              <input name="body" required maxLength={2000} placeholder="Add a comment…" className="input min-w-0 flex-1" />
              <button className="btn-ghost">Send</button>
            </Form>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card">
            <p className="tag mb-3">[ Preview ]</p>
            <div className="overflow-hidden rounded-xl border border-edge bg-white">
              <div className="flex items-center gap-2 px-3 py-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest text-xs font-bold text-lime">{p.clients?.business_name?.[0]}</span><span className="text-sm font-semibold">{p.clients?.business_name}</span></div>
              {cover ? (cover.mime_type?.startsWith("video/")
                ? <video src={`/api/media/${cover.id}#t=0.1`} controls preload="metadata" playsInline className="aspect-square w-full bg-ink object-contain" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={`/api/media/${cover.id}`} alt="" className="aspect-square w-full object-cover" />)
                : <div className="flex aspect-square w-full items-center justify-center bg-forest-soft font-mono text-xs uppercase text-forest/60">Upload your work</div>}
              <div className="px-3 py-3 text-[13px]"><p className="whitespace-pre-wrap"><span className="font-semibold">{p.clients?.business_name}</span> {p.caption}</p>{tags && <p className="mt-1 text-forest">{tags}</p>}</div>
            </div>
            {p.scheduled_at && <p className="mt-2 font-mono text-[11px] text-mute">Planned: <LocalTime iso={p.scheduled_at} /></p>}
          </section>

          {social && (
            <section className="card space-y-2">
              <p className="tag mb-1">[ Next step ]</p>
              {p.status === "idea" && <Form action={setPostStageAction} quiet><input type="hidden" name="id" value={id} /><button name="to" value="in_progress" className="btn-primary w-full">Start drafting</button></Form>}
              {p.status === "in_progress" && (
                <Form action={setPostStageAction} className="space-y-2" quiet><input type="hidden" name="id" value={id} />
                  <button name="to" value="awaiting_approval" className="btn-primary w-full">Send for review</button>
                  <button name="to" value="idea" className="btn-ghost w-full">Back to ideas</button></Form>
              )}
              {p.status === "awaiting_approval" && <Form action={setPostStageAction} quiet><input type="hidden" name="id" value={id} /><p className="mb-2 text-sm text-mute">Waiting for a manager.</p><button name="to" value="in_progress" className="btn-ghost w-full">Withdraw to keep editing</button></Form>}
              {p.status === "rejected" && (
                <Form action={setPostStageAction} className="space-y-2" quiet><input type="hidden" name="id" value={id} />
                  <button name="to" value="awaiting_approval" className="btn-primary w-full">Resubmit for review</button>
                  <button name="to" value="in_progress" className="btn-ghost w-full">Keep editing</button></Form>
              )}
              {(p.status === "approved" || p.status === "scheduled") && <Form action={reviewPostAction} quiet><input type="hidden" name="id" value={id} /><button name="decision" value="posted" className="btn-lime w-full">Mark as posted</button></Form>}
              {p.status === "posted" && <p className="text-sm text-mute">Posted{p.posted_at ? <> on <LocalTime iso={p.posted_at} mode="date" /></> : ""}.</p>}
            </section>
          )}

          {lead && p.status === "awaiting_approval" && (
            <section className="card border-amber-300">
              <p className="tag mb-2">[ Review ]</p>
              <Form action={reviewPostAction} className="space-y-2" quiet>
                <input type="hidden" name="id" value={id} />
                <textarea name="note" rows={3} placeholder="Feedback for the team (needed when asking for changes)" className="input" />
                <button name="decision" value="approve" className="btn-primary w-full">Approve · client can see it</button>
                <button name="decision" value="reject" className="btn-danger w-full">Request changes</button>
              </Form>
            </section>
          )}

          {social && (
            <Form action={deletePostAction} quiet><input type="hidden" name="id" value={id} /><DeleteButton label="Delete this post" message="Delete this post and its files? This can't be undone." /></Form>
          )}
        </aside>
      </div>
    </Shell>
  );
}
