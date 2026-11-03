import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Form from "@/components/Form";
import DeleteButton from "@/components/DeleteButton";
import PitchBox from "@/components/PitchBox";
import Shell, { PageHead, fmtDate } from "@/components/Shell";
import { convertProspectAction, deleteProspectAction, logProspectActivityAction, setProspectStatusAction, updateProspectAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { SERVICES, STAGES, scoreLabel, whyThem } from "@/lib/sales";
import { isLeadRole } from "@/lib/roles";
import { CURRENCIES } from "@/lib/currency";

export const dynamic = "force-dynamic";
const SALES_ROLES = ["admin", "manager", "marketing", "social_manager"];
const kindLabel: Record<string, string> = { note: "Note", call: "Call", whatsapp: "WhatsApp", email: "Email", dm: "DM", meeting: "Meeting", status: "Stage" };

export default async function Prospect({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !SALES_ROLES.includes(me.role)) redirect("/");
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: p } = await sb.from("prospects").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: acts }, { data: team }] = await Promise.all([
    sb.from("prospect_activities").select("id,kind,body,created_at,profiles:created_by(full_name)").eq("prospect_id", id).order("created_at", { ascending: false }).limit(80),
    sb.from("profiles").select("id,full_name,email").eq("status", "active").in("role", ["admin", "manager", "marketing", "social_manager"]).order("full_name"),
  ]);
  const lead = isLeadRole(me.role);
  const why = whyThem(p);
  const closed = p.status === "won" || p.status === "lost";

  return (
    <Shell me={me}>
      <Link href="/growth" className="tag hover:text-forest">← Pipeline</Link>
      <div className="mt-3" />
      <PageHead tag={`${p.category || "Prospect"}${p.city ? ` · ${p.city}` : ""}`} title={p.business_name} sub={why.length ? `Why they need us: ${why.join(", ")}.` : undefined}>
        <span className={`pill ${p.score >= 70 ? "bg-red-50 text-red-700" : p.score >= 45 ? "bg-amber-50 text-amber-700" : "bg-forest-soft text-forest"}`}>{scoreLabel(p.score)} · {p.score}</span>
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/* stage */}
          <div className="card">
            <p className="tag mb-3">[ Stage ]</p>
            <div className="flex flex-wrap gap-2">
              {STAGES.filter((s) => s.id !== "won").map((s) => (
                <Form key={s.id} action={setProspectStatusAction} quiet>
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={s.id} />
                  {s.id === "lost" && <input type="hidden" name="lost_reason" value="Not interested" />}
                  <button className={p.status === s.id ? "btn-primary" : "btn-ghost"} disabled={p.status === s.id}>{s.label}</button>
                </Form>
              ))}
              {p.status === "won" && <span className="pill bg-forest text-lime">Won</span>}
            </div>
            {p.status === "lost" && p.lost_reason && <p className="mt-2 text-xs text-mute">Reason: {p.lost_reason}</p>}
            {p.client_id && <Link href={`/clients/${p.client_id}`} className="btn-lime mt-3 inline-flex">Open client →</Link>}
            {!p.client_id && lead && !p.status.match(/lost/) && (
              <Form action={convertProspectAction} className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-4">
                <input type="hidden" name="id" value={p.id} />
                <input name="country" defaultValue={p.country || "United Kingdom"} className="input !w-44" aria-label="Country" />
                <select name="currency" defaultValue="" className="input !w-auto" aria-label="Currency"><option value="">Auto currency</option>{CURRENCIES.map((c) => <option key={c.code}>{c.code}</option>)}</select>
                <button className="btn-lime">Convert to client</button>
              </Form>
            )}
            {!p.client_id && !lead && p.status === "proposal" && <p className="mt-3 text-xs text-mute">When they say yes, ask a manager or the admin to convert them to a client.</p>}
          </div>

          {/* reach out */}
          {!closed && <PitchBox id={p.id} phone={p.phone} email={p.email} contact={p.contact_name} business={p.business_name} me={me.full_name || "the Anweo team"} country={p.country || "United Kingdom"} />}

          {/* log */}
          <div className="card">
            <p className="tag mb-3">[ Log what happened ]</p>
            <Form action={logProspectActivityAction} className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <div className="flex flex-wrap gap-2">
                <select name="kind" className="input !w-auto" defaultValue="note">{["note", "call", "whatsapp", "email", "dm", "meeting"].map((k) => <option key={k} value={k}>{kindLabel[k]}</option>)}</select>
                <label className="flex items-center gap-2 text-xs text-mute">Follow up on<input type="date" name="next_follow_up" className="input !w-auto !py-1.5" /></label>
              </div>
              <textarea name="body" rows={2} placeholder="What was said? Next step?" className="input" />
              <button className="btn-primary">Add to timeline</button>
            </Form>
            <div className="mt-4 space-y-2">
              {(acts ?? []).length === 0 && <p className="text-sm text-mute">Nothing logged yet.</p>}
              {(acts ?? []).map((a: any) => (
                <div key={a.id} className="rounded-xl border border-edge bg-paper/60 px-3.5 py-2.5 text-sm">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-mute">{kindLabel[a.kind] ?? a.kind} · {a.profiles?.full_name ?? "Someone"} · {fmtDate(a.created_at, true)}</p>
                  {a.body && <p className="mt-0.5 whitespace-pre-wrap">{a.body}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* details */}
        <div className="space-y-5">
          <div className="card">
            <p className="tag mb-3">[ Details ]</p>
            {p.maps_url && <a href={p.maps_url} target="_blank" rel="noreferrer" className="mb-3 inline-block text-sm text-forest underline">View on Google Maps{p.rating ? ` · ${p.rating}★ (${p.review_count ?? 0})` : ""}</a>}
            <Form action={updateProspectAction} className="grid gap-2.5">
              <input type="hidden" name="id" value={p.id} />
              <input name="business_name" defaultValue={p.business_name} required className="input" aria-label="Business name" />
              <input name="contact_name" defaultValue={p.contact_name ?? ""} placeholder="Contact person" className="input" />
              <input name="phone" defaultValue={p.phone ?? ""} placeholder="Phone / WhatsApp" className="input" />
              <input name="email" defaultValue={p.email ?? ""} placeholder="Email" className="input" />
              <input name="website" defaultValue={p.website ?? ""} placeholder="Website" className="input" />
              <input name="instagram" defaultValue={p.instagram ?? ""} placeholder="Instagram" className="input" />
              <input name="address" defaultValue={p.address ?? ""} placeholder="Address" className="input" />
              <div className="grid grid-cols-2 gap-2"><input name="city" defaultValue={p.city ?? ""} placeholder="City" className="input" /><input name="category" defaultValue={p.category ?? ""} placeholder="Type" className="input" /></div>
              <select name="service_interest" defaultValue={p.service_interest ?? ""} className="input"><option value="">Service to pitch</option>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select>
              <div className="grid grid-cols-[1fr_auto] gap-2"><input name="est_value" type="number" step="0.01" min="0" defaultValue={p.est_value ?? ""} placeholder="Deal value" className="input" /><select name="currency" defaultValue={p.currency} className="input !w-auto">{CURRENCIES.map((c) => <option key={c.code}>{c.code}</option>)}</select></div>
              <label className="text-xs text-mute">Next follow-up<input type="date" name="next_follow_up" defaultValue={p.next_follow_up ?? ""} className="input mt-1" /></label>
              <label className="text-xs text-mute">Owner<select name="assigned_to" defaultValue={p.assigned_to ?? ""} className="input mt-1"><option value="">Nobody</option>{(team ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}</select></label>
              <textarea name="notes" rows={3} defaultValue={p.notes ?? ""} placeholder="Notes" className="input" />
              <button className="btn-primary">Save details</button>
            </Form>
          </div>
          {lead && <Form action={deleteProspectAction}><input type="hidden" name="id" value={p.id} /><DeleteButton label="Delete prospect" message="Delete this prospect and its history?" /></Form>}
        </div>
      </div>
    </Shell>
  );
}
