import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Shell, { Empty, label, money, statusPill } from "@/components/Shell";
import {
  addInvoiceAction, addPostAction, addWorkAction, assignServiceAction,
  markInvoicePaidAction, removeServiceAction, setWorkStatusAction,
} from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const lead = me.role === "admin" || me.role === "manager";
  const sb = await supabaseServer();
  const { id } = await params;

  const { data: client } = await sb.from("clients").select("*").eq("id", id).single();
  if (!client) notFound();

  const [{ data: services }, { data: packages }, { data: subs }, { data: work }, { data: posts }, { data: invoices }] = await Promise.all([
    sb.from("services").select("id,name").eq("active", true).order("sort_order"),
    sb.from("packages").select("id,service_id,name,price_monthly,currency").eq("active", true).order("price_monthly"),
    sb.from("client_services").select("id,price_monthly,currency,status,services(name),packages(name)").eq("client_id", id).order("created_at"),
    sb.from("work_items").select("id,title,status,due_date,visible_to_client").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("social_posts").select("id,kind,platform,caption,status,scheduled_at").eq("client_id", id).order("created_at", { ascending: false }),
    lead ? sb.from("invoices").select("*").eq("client_id", id).order("issued_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ]);

  const activeSubs = (subs ?? []).filter((s: any) => s.status === "active");
  const mrr = activeSubs.filter((s: any) => s.currency === "GBP").reduce((a: number, s: any) => a + Number(s.price_monthly), 0);
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "No time set");

  return (
    <Shell me={me}>
      <div className="space-y-5">
        <div>
          <Link href="/" className="tag hover:text-forest">← All clients</Link>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest text-2xl font-bold text-lime">{client.business_name[0]?.toUpperCase()}</span>
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-bold tracking-tight sm:text-4xl">{client.business_name}</h1>
              <p className="text-sm text-mute">{[client.contact_name, client.email, client.phone, client.country].filter(Boolean).join(" · ")}</p>
            </div>
            {lead && <div className="ml-auto text-right"><p className="tag">Monthly</p><p className="text-2xl font-bold text-forest">{money(mrr)}</p></div>}
          </div>
        </div>

        {/* Services */}
        <section className="card">
          <p className="tag mb-3">[ Selected services ]</p>
          <div className="space-y-2">
            {!lead && <Empty>Service and pricing details are visible to managers and admins.</Empty>}
            {lead && (subs ?? []).length === 0 && <Empty>No services selected yet. Pick one below.</Empty>}
            {lead && (subs ?? []).map((s: any) => (
              <div key={s.id} className="row flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium">{s.services?.name}</p>
                  <p className="font-mono text-[11px] text-mute">{s.packages?.name ?? "Custom price"}</p>
                </div>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{money(s.price_monthly, s.currency)}</span>
                  <span className={`pill ${statusPill(s.status)}`}>{s.status}</span>
                  {s.status === "active" && (
                    <form action={removeServiceAction}>
                      <input type="hidden" name="id" value={s.id} /><input type="hidden" name="client_id" value={id} />
                      <button className="text-xs font-medium text-red-700 hover:underline">Cancel</button>
                    </form>
                  )}
                </span>
              </div>
            ))}
          </div>
          {lead && (
            <form action={assignServiceAction} className="mt-5 grid gap-3 border-t border-edge pt-5 sm:grid-cols-4">
              <input type="hidden" name="client_id" value={id} />
              <div className="sm:col-span-4">
                <label className="label">Service and package</label>
                <select name="choice" required className="input">
                  {(services ?? []).map((s) => (
                    <optgroup key={s.id} label={s.name}>
                      {(packages ?? []).filter((p) => p.service_id === s.id).map((p) => (
                        <option key={p.id} value={`${s.id}:${p.id}`}>{p.name} · {money(p.price_monthly, p.currency)}/mo</option>
                      ))}
                      <option value={`${s.id}:`}>Custom price</option>
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2"><label className="label">Override price (optional)</label><input name="price_monthly" type="number" min="0" step="0.01" placeholder="Leave blank to use the package price" className="input" /></div>
              <div><label className="label">Currency</label><select name="currency" className="input"><option>GBP</option><option>INR</option></select></div>
              <div className="flex items-end"><button className="btn-primary w-full">Add service</button></div>
              <p className="text-xs text-mute sm:col-span-4">Choosing “Custom price” needs a price above. Manage packages under Services.</p>
            </form>
          )}
        </section>

        {/* Work */}
        <section className="card">
          <p className="tag mb-3">[ Work ]</p>
          <div className="space-y-2">
            {(work ?? []).length === 0 && <Empty>No work items yet.</Empty>}
            {(work ?? []).map((w) => (
              <form key={w.id} action={setWorkStatusAction} className="row">
                <input type="hidden" name="id" value={w.id} /><input type="hidden" name="client_id" value={id} />
                <span className="min-w-0 truncate">{w.title}{!w.visible_to_client && <span className="ml-2 font-mono text-[10px] uppercase text-mute">internal</span>}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <select name="status" defaultValue={w.status} className="input !w-auto !py-1.5 !text-xs">
                    {["todo", "in_progress", "review", "done"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                  <button className="btn-ghost !px-3 !py-1.5 text-xs">Save</button>
                </span>
              </form>
            ))}
          </div>
          <form action={addWorkAction} className="mt-5 grid gap-3 border-t border-edge pt-5 sm:grid-cols-4">
            <input type="hidden" name="client_id" value={id} />
            <div className="sm:col-span-2"><label className="label">New task</label><input name="title" required className="input" /></div>
            <div><label className="label">Due</label><input name="due_date" type="date" className="input" /></div>
            <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" name="visible" defaultChecked className="h-4 w-4 accent-forest" /> Show to client</label>
            <div className="sm:col-span-4"><button className="btn-primary">Add task</button></div>
          </form>
        </section>

        {/* Social */}
        <section className="card">
          <p className="tag mb-3">[ Social content ]</p>
          <div className="space-y-2">
            {(posts ?? []).length === 0 && <Empty>No posts yet.</Empty>}
            {(posts ?? []).map((p) => (
              <div key={p.id} className="rounded-xl border border-edge bg-paper/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium capitalize">{p.kind} · {p.platform}</span><span className={`pill ${statusPill(p.status)}`}>{label(p.status)}</span></div>
                {p.caption && <p className="mt-1.5 line-clamp-2 text-ink/70">{p.caption}</p>}
                <p className="mt-1.5 font-mono text-[11px] text-mute">{fmt(p.scheduled_at)}</p>
              </div>
            ))}
          </div>
          <form action={addPostAction} className="mt-5 grid gap-3 border-t border-edge pt-5 sm:grid-cols-4">
            <input type="hidden" name="client_id" value={id} />
            <div><label className="label">Type</label><select name="kind" className="input"><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></div>
            <div><label className="label">Platform</label><select name="platform" className="input"><option>instagram</option><option>facebook</option><option>tiktok</option><option>linkedin</option></select></div>
            <div className="sm:col-span-2"><label className="label">Publish at</label><input name="scheduled_at" type="datetime-local" className="input" /></div>
            <div className="sm:col-span-4"><label className="label">Caption / script</label><textarea name="caption" rows={3} className="input" /></div>
            <div className="sm:col-span-4"><button className="btn-primary">Send for approval</button></div>
          </form>
        </section>

        {/* Billing (admin / manager only) */}
        {lead && (
          <section className="card">
            <p className="tag mb-3">[ Billing ]</p>
            <div className="space-y-2">
              {(invoices ?? []).length === 0 && <Empty>No invoices yet.</Empty>}
              {(invoices ?? []).map((i: any) => (
                <div key={i.id} className="row flex-wrap">
                  <span>{i.period_label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{money(i.amount, i.currency)}</span><span className={`pill ${statusPill(i.status)}`}>{i.status}</span>
                    {i.status !== "paid" && (
                      <form action={markInvoicePaidAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="client_id" value={id} /><button className="text-xs font-medium text-forest hover:underline">Mark paid</button></form>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <form action={addInvoiceAction} className="mt-5 grid gap-3 border-t border-edge pt-5 sm:grid-cols-4">
              <input type="hidden" name="client_id" value={id} />
              <div><label className="label">Period</label><input name="period_label" placeholder="November 2026" className="input" /></div>
              <div><label className="label">Amount</label><input name="amount" type="number" min="1" step="0.01" required className="input" /></div>
              <div><label className="label">Currency</label><select name="currency" className="input"><option>GBP</option><option>INR</option></select></div>
              <div className="flex items-end"><button className="btn-primary w-full">Add invoice</button></div>
            </form>
          </section>
        )}
      </div>
    </Shell>
  );
}
