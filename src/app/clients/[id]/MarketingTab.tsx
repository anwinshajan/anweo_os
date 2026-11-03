import CopyButton from "@/components/CopyButton";
import CurrencySelect from "@/components/CurrencySelect";
import DeleteButton from "@/components/DeleteButton";
import Form from "@/components/Form";
import { money } from "@/components/Shell";
import {
  addSocialAccountAction, deleteMetricsAction, deleteSocialAccountAction, saveBrandAction, saveMetricsAction,
} from "@/app/actions";
import { supabaseServer } from "@/lib/supabase-server";

const PLATFORMS: [string, string][] = [["instagram", "Instagram"], ["facebook", "Facebook"], ["youtube", "YouTube"], ["linkedin", "LinkedIn"], ["tiktok", "TikTok"], ["whatsapp", "WhatsApp"], ["google_business", "Google Business"], ["other", "Other"]];
const n = (v: number | null) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("en-GB"));

export default async function MarketingTab({ id, canEdit, currency, origin }: { id: string; canEdit: boolean; currency: string; origin: string }) {
  const sb = await supabaseServer();
  const [{ data: brand }, { data: accounts }, { data: metrics }, { data: client }] = await Promise.all([
    sb.from("client_brand").select("*").eq("client_id", id).maybeSingle(),
    sb.from("social_accounts").select("id,platform,handle,url").eq("client_id", id).order("created_at"),
    sb.from("client_metrics").select("id,period,platform,followers,reach,impressions,engagement,ad_spend,ad_currency,notes").eq("client_id", id).order("period", { ascending: false }).limit(24),
    sb.from("clients").select("lead_key").eq("id", id).single(),
  ]);
  const b: Record<string, string | null> = (brand as any) ?? {};
  const thisMonth = new Date().toISOString().slice(0, 7);
  const endpoint = `${origin}/api/leads/${client?.lead_key}`;
  const snippet = `<form action="${endpoint}" method="post">\n  <input name="name" placeholder="Your name" required>\n  <input name="phone" placeholder="Phone / WhatsApp">\n  <input name="email" type="email" placeholder="Email">\n  <textarea name="message" placeholder="How can we help?"></textarea>\n  <input type="hidden" name="source" value="website">\n  <input type="hidden" name="redirect" value="https://YOUR-SITE.com/thank-you">\n  <button>Send</button>\n</form>`;
  const ro = !canEdit;

  return (
    <div className="space-y-5">
      <section className="card">
        <p className="tag mb-1">[ Brand kit ]</p>
        <p className="mb-3 text-sm text-mute">The team's single source of truth for how this client looks and sounds.</p>
        <Form action={saveBrandAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="client_id" value={id} />
          <div className="sm:col-span-2"><label className="label">Tagline</label><input name="tagline" defaultValue={b.tagline ?? ""} readOnly={ro} className="input" /></div>
          <div><label className="label">Tone of voice</label><input name="tone" defaultValue={b.tone ?? ""} readOnly={ro} placeholder="Warm, premium, calm" className="input" /></div>
          <div><label className="label">Audience</label><input name="audience" defaultValue={b.audience ?? ""} readOnly={ro} placeholder="Women 22-40 in Kochi" className="input" /></div>
          <div><label className="label">Brand colours</label><input name="colors" defaultValue={b.colors ?? ""} readOnly={ro} placeholder="#0E5A44, #C9F25A" className="input" /></div>
          <div><label className="label">Fonts</label><input name="fonts" defaultValue={b.fonts ?? ""} readOnly={ro} className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Standard hashtags</label><input name="hashtags" defaultValue={b.hashtags ?? ""} readOnly={ro} placeholder="#salon #bridal" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Goals this quarter</label><textarea name="goals" rows={2} defaultValue={b.goals ?? ""} readOnly={ro} className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Never do</label><textarea name="dont" rows={2} defaultValue={b.dont ?? ""} readOnly={ro} placeholder="No discounts wording, no competitor mentions…" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Logo and asset folder (link)</label><input name="assets_link" defaultValue={b.assets_link ?? ""} readOnly={ro} placeholder="https://drive.google.com/…" className="input" /></div>
          {canEdit && <div className="sm:col-span-2"><button className="btn-primary">Save brand kit</button></div>}
        </Form>
      </section>

      <section className="card">
        <p className="tag mb-3">[ Accounts we manage ]</p>
        <div className="space-y-2">
          {(accounts ?? []).length === 0 && <p className="text-sm text-mute">No accounts added yet.</p>}
          {(accounts ?? []).map((a) => (
            <div key={a.id} className="row">
              <span className="min-w-0"><span className="font-medium">{PLATFORMS.find((p) => p[0] === a.platform)?.[1] ?? a.platform}</span> <span className="text-mute">{a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-forest hover:underline">{a.handle}</a> : a.handle}</span></span>
              {canEdit && <Form action={deleteSocialAccountAction} quiet><input type="hidden" name="id" value={a.id} /><input type="hidden" name="client_id" value={id} /><DeleteButton label="Remove" message="Remove this account?" /></Form>}
            </div>
          ))}
        </div>
        {canEdit && (
          <Form action={addSocialAccountAction} className="mt-4 grid gap-2 border-t border-edge pt-4 sm:grid-cols-4">
            <input type="hidden" name="client_id" value={id} />
            <select name="platform" className="input">{PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input name="handle" required placeholder="@handle or page name" className="input sm:col-span-1" />
            <input name="url" placeholder="Link (optional)" className="input" />
            <button className="btn-ghost">Add account</button>
          </Form>
        )}
      </section>

      <section className="card">
        <p className="tag mb-1">[ Monthly results ]</p>
        <p className="mb-3 text-sm text-mute">Type in the numbers from Instagram, Facebook and the ad accounts each month. They feed the client's report.</p>
        {canEdit && (
          <Form action={saveMetricsAction} className="mb-4 grid gap-2 sm:grid-cols-6">
            <input type="hidden" name="client_id" value={id} />
            <div><label className="label">Month</label><input type="month" name="month" defaultValue={thisMonth} required className="input" /></div>
            <div><label className="label">Platform</label><select name="platform" className="input"><option value="all">All combined</option>{PLATFORMS.slice(0, 5).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label className="label">Followers</label><input name="followers" type="number" min="0" className="input" /></div>
            <div><label className="label">Reach</label><input name="reach" type="number" min="0" className="input" /></div>
            <div><label className="label">Impressions</label><input name="impressions" type="number" min="0" className="input" /></div>
            <div><label className="label">Engagement</label><input name="engagement" type="number" min="0" className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Ad spend</label><div className="flex gap-2"><CurrencySelect name="ad_currency" short defaultValue={currency} className="input !w-24 shrink-0" /><input name="ad_spend" type="number" min="0" step="0.01" className="input min-w-0 flex-1" /></div></div>
            <div className="sm:col-span-3"><label className="label">Highlights for the report</label><input name="notes" placeholder="Bridal reel reached 12k people" className="input" /></div>
            <div className="flex items-end"><button className="btn-primary w-full">Save month</button></div>
            <p className="text-xs text-mute sm:col-span-6">Saving a month that already exists updates it.</p>
          </Form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="font-mono text-[10px] uppercase tracking-wider text-mute"><th className="py-2 pr-3">Month</th><th className="pr-3">Platform</th><th className="pr-3 text-right">Followers</th><th className="pr-3 text-right">Reach</th><th className="pr-3 text-right">Impr.</th><th className="pr-3 text-right">Engage.</th><th className="pr-3 text-right">Ad spend</th><th /></tr></thead>
            <tbody>
              {(metrics ?? []).length === 0 && <tr><td colSpan={8} className="py-4 text-mute">No results recorded yet.</td></tr>}
              {(metrics ?? []).map((r) => (
                <tr key={r.id} className="border-t border-edge">
                  <td className="py-2 pr-3 font-medium">{new Date(`${r.period}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}</td>
                  <td className="pr-3 capitalize text-mute">{r.platform}</td>
                  <td className="pr-3 text-right">{n(r.followers)}</td><td className="pr-3 text-right">{n(r.reach)}</td><td className="pr-3 text-right">{n(r.impressions)}</td><td className="pr-3 text-right">{n(r.engagement)}</td>
                  <td className="pr-3 text-right">{r.ad_spend !== null ? money(r.ad_spend, r.ad_currency ?? currency) : "–"}</td>
                  <td className="text-right">{canEdit && <Form action={deleteMetricsAction} quiet><input type="hidden" name="id" value={r.id} /><input type="hidden" name="client_id" value={id} /><DeleteButton label="×" message="Delete this month's numbers?" /></Form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <p className="tag mb-1">[ Monthly report ]</p>
        <p className="mb-3 text-sm text-mute">A branded PDF with what we published, the results, leads and work completed. Clients can open the same report from their dashboard.</p>
        <form action={`/api/reports/${id}/pdf`} method="get" target="_blank" className="flex flex-wrap items-end gap-2">
          <div><label className="label">Month</label><input type="month" name="month" defaultValue={thisMonth} className="input" /></div>
          <button className="btn-primary">Open report</button>
        </form>
      </section>

      <section className="card">
        <p className="tag mb-1">[ Lead form for the client's website ]</p>
        <p className="mb-3 text-sm text-mute">Paste this on any page. Enquiries land in the Leads tab and the client is notified. Fields: name, phone, email, message.</p>
        <pre className="overflow-x-auto rounded-xl bg-ink p-4 text-[11px] leading-relaxed text-paper">{snippet}</pre>
        <div className="mt-3 flex flex-wrap gap-2"><CopyButton text={snippet} label="Copy the form" /><CopyButton text={endpoint} label="Copy just the link" /></div>
      </section>
    </div>
  );
}
