import Link from "next/link";
import { redirect } from "next/navigation";
import Form from "@/components/Form";
import Shell, { Empty, PageHead, fmtDate } from "@/components/Shell";
import { addProspectAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { SERVICES, SOURCES, STAGES, scoreLabel } from "@/lib/sales";
import { isoDay } from "@/lib/payments";

export const dynamic = "force-dynamic";
const SALES_ROLES = ["admin", "manager", "marketing", "social_manager"];

export default async function Growth({ searchParams }: { searchParams: Promise<{ q?: string; mine?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !SALES_ROLES.includes(me.role)) redirect("/");
  const { q = "", mine } = await searchParams;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("prospects")
    .select("id,business_name,contact_name,city,category,status,score,next_follow_up,assigned_to,est_value,currency,phone,profiles:assigned_to(full_name)")
    .order("score", { ascending: false })
    .limit(600);
  let all = (data ?? []) as any[];
  if (mine) all = all.filter((p) => p.assigned_to === me.id);
  if (q) all = all.filter((p) => `${p.business_name} ${p.city ?? ""} ${p.category ?? ""} ${p.contact_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  const today = isoDay();
  const live = all.filter((p) => !["won", "lost"].includes(p.status));
  const due = live.filter((p) => p.next_follow_up && p.next_follow_up <= today).sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up));
  const won = all.filter((p) => p.status === "won").length, lost = all.filter((p) => p.status === "lost").length;
  const rate = won + lost ? Math.round((won / (won + lost)) * 100) : null;
  const pipeline: Record<string, number> = {};
  live.filter((p) => p.est_value).forEach((p) => { pipeline[p.currency] = (pipeline[p.currency] ?? 0) + Number(p.est_value); });

  const stat = (label: string, value: string, sub?: string) => (
    <div className="card !p-4"><p className="tag">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p>{sub && <p className="text-xs text-mute">{sub}</p>}</div>
  );

  return (
    <Shell me={me}>
      <PageHead tag="Anweo growth" title="Find clients" sub="Find local businesses, reach out, follow up and turn them into clients. Only the sales team sees this.">
        <div className="flex gap-2">
          <Link href="/growth/find" className="btn-primary">Find leads</Link>
        </div>
      </PageHead>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("In pipeline", String(live.length), `${all.filter((p) => p.status === "new").length} not contacted`)}
        {stat("Follow-ups due", String(due.length), due.length ? "Do these first" : "All clear")}
        {stat("Won", String(won), rate !== null ? `${rate}% of closed` : "No closed deals yet")}
        {stat("Est. value", Object.keys(pipeline).length ? Object.entries(pipeline).map(([c, v]) => `${c} ${Math.round(v).toLocaleString("en-GB")}`).join(" · ") : "—", "Open deals with a value")}
      </div>

      {due.length > 0 && (
        <section className="mb-6">
          <p className="tag mb-2">[ Follow up today ]</p>
          <div className="space-y-2">
            {due.slice(0, 8).map((p) => (
              <Link key={p.id} href={`/growth/${p.id}`} className="row hover:border-forest/40">
                <span className="min-w-0"><span className="block truncate font-semibold">{p.business_name}</span><span className="font-mono text-[11px] text-mute">{STAGES.find((s) => s.id === p.status)?.label} · due {fmtDate(p.next_follow_up)}</span></span>
                <span className="btn-ghost !px-3 !py-1.5 text-xs">Open</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="flex-1" action="/growth"><input name="q" defaultValue={q} placeholder="Search prospects" className="input" aria-label="Search prospects" />{mine && <input type="hidden" name="mine" value="1" />}</form>
        <Link href={mine ? `/growth${q ? `?q=${encodeURIComponent(q)}` : ""}` : `/growth?mine=1${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={mine ? "btn-primary" : "btn-ghost"}>My prospects</Link>
      </div>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        {STAGES.map((st) => {
          const col = all.filter((p) => p.status === st.id);
          return (
            <div key={st.id} className="w-[270px] shrink-0 snap-start rounded-xl2 border border-edge bg-paper/60 p-2.5">
              <div className="mb-2 flex items-center justify-between px-1.5"><p className="text-sm font-bold">{st.label}</p><span className="font-mono text-[11px] text-mute">{col.length}</span></div>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {col.length === 0 && <p className="px-2 py-4 text-center text-xs text-mute">{st.hint}</p>}
                {col.slice(0, 40).map((p) => (
                  <Link key={p.id} href={`/growth/${p.id}`} className="block rounded-xl border border-edge bg-white p-3 transition hover:-translate-y-0.5 hover:border-forest/40">
                    <p className="truncate font-semibold">{p.business_name}</p>
                    <p className="truncate text-xs text-mute">{[p.category, p.city].filter(Boolean).join(" · ") || "—"}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {st.id !== "won" && st.id !== "lost" ? <span className={`pill ${p.score >= 70 ? "bg-red-50 text-red-700" : p.score >= 45 ? "bg-amber-50 text-amber-700" : "bg-forest-soft text-forest"}`}>{scoreLabel(p.score)}</span> : <span />}
                      <span className="font-mono text-[10px] text-mute">{p.next_follow_up && !["won", "lost"].includes(p.status) ? `follow up ${fmtDate(p.next_follow_up)}` : p.profiles?.full_name?.split(" ")[0] ?? ""}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {all.length === 0 && <Empty>No prospects yet. Use “Find leads” to search Google for local businesses, import a list, or add one below.</Empty>}

      <details className="card mt-6">
        <summary className="cursor-pointer font-semibold">Add a prospect by hand</summary>
        <Form action={addProspectAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="business_name" required placeholder="Business name" className="input sm:col-span-2" />
          <input name="contact_name" placeholder="Contact person" className="input" />
          <input name="phone" placeholder="Phone / WhatsApp" className="input" />
          <input name="email" type="email" placeholder="Email" className="input" />
          <input name="website" placeholder="Website (leave empty if none)" className="input" />
          <input name="instagram" placeholder="Instagram handle" className="input" />
          <input name="city" placeholder="City" className="input" />
          <input name="category" placeholder="Type of business" className="input" />
          <select name="service_interest" className="input" defaultValue=""><option value="">Service to pitch</option>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select>
          <select name="source" className="input" defaultValue="manual">{SOURCES.filter((s) => s !== "google" && s !== "csv").map((s) => <option key={s}>{s}</option>)}</select>
          <textarea name="notes" rows={2} placeholder="Notes" className="input sm:col-span-2" />
          <button className="btn-primary sm:col-span-2">Add prospect</button>
        </Form>
      </details>
    </Shell>
  );
}
