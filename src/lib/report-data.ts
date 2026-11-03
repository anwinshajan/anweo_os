import { supabaseServer } from "@/lib/supabase-server";
import { monthRange } from "@/lib/recurrence";

export type Report = {
  client: { id: string; name: string; currency: string };
  month: string; label: string;
  published: { title: string; platform: string; kind: string; at: string }[];
  approvedCount: number; scheduledCount: number;
  metrics: { platform: string; followers: number | null; reach: number | null; impressions: number | null; engagement: number | null; ad_spend: number | null; ad_currency: string | null; prevFollowers: number | null; notes: string | null }[];
  leads: { total: number; won: number; wonValue: number; byStatus: Record<string, number> };
  workDone: string[]; updates: { project: string; body: string; at: string }[];
  brandGoals: string | null;
};

// Everything a monthly report shows, read with the signed-in person's own access (so a client only ever gets their own).
export async function loadReport(clientId: string, month: string): Promise<Report | null> {
  const range = monthRange(month);
  if (!range || !/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const sb = await supabaseServer();
  const { data: c } = await sb.from("clients").select("id,business_name,currency").eq("id", clientId).single();
  if (!c) return null;
  const startIso = `${range.start}T00:00:00Z`, endIso = `${range.end}T00:00:00Z`;
  const prevStart = (() => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 10); })();

  const [posts, metrics, prev, leads, work, updates, brand] = await Promise.all([
    sb.from("social_posts").select("title,caption,platform,kind,status,posted_at,scheduled_at").eq("client_id", clientId).in("status", ["posted", "approved", "scheduled"]).or(`and(posted_at.gte.${startIso},posted_at.lt.${endIso}),and(scheduled_at.gte.${startIso},scheduled_at.lt.${endIso})`),
    sb.from("client_metrics").select("platform,followers,reach,impressions,engagement,ad_spend,ad_currency,notes").eq("client_id", clientId).eq("period", range.start),
    sb.from("client_metrics").select("platform,followers").eq("client_id", clientId).eq("period", prevStart),
    sb.from("leads").select("status,value").eq("client_id", clientId).gte("created_at", startIso).lt("created_at", endIso),
    sb.from("work_items").select("title").eq("client_id", clientId).eq("visible_to_client", true).eq("status", "done").gte("updated_at", startIso).lt("updated_at", endIso).limit(12),
    sb.from("project_updates").select("body,created_at,projects(title)").gte("created_at", startIso).lt("created_at", endIso).order("created_at").limit(8),
    sb.from("client_brand").select("goals").eq("client_id", clientId).maybeSingle(),
  ]);
  const prevF = new Map((prev.data ?? []).map((r) => [r.platform, r.followers as number | null]));
  const inMonth = (iso: string | null) => !!iso && iso >= startIso && iso < endIso;
  const published = (posts.data ?? []).filter((p) => p.status === "posted" && inMonth(p.posted_at)).map((p) => ({ title: p.title || (p.caption ?? "").slice(0, 60) || "Post", platform: p.platform, kind: p.kind, at: p.posted_at as string })).sort((a, b) => a.at.localeCompare(b.at));
  const lrows = leads.data ?? [];
  const byStatus: Record<string, number> = {};
  for (const l of lrows) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
  const label = new Date(`${range.start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return {
    client: { id: c.id, name: c.business_name, currency: c.currency }, month, label, published,
    approvedCount: (posts.data ?? []).filter((p) => p.status === "approved" && inMonth(p.scheduled_at)).length,
    scheduledCount: (posts.data ?? []).filter((p) => p.status === "scheduled" && inMonth(p.scheduled_at)).length,
    metrics: (metrics.data ?? []).map((m) => ({ ...m, ad_spend: m.ad_spend === null ? null : Number(m.ad_spend), prevFollowers: prevF.get(m.platform) ?? null })) as Report["metrics"],
    leads: { total: lrows.length, won: byStatus.won ?? 0, wonValue: lrows.filter((l) => l.status === "won").reduce((a, l) => a + Number(l.value ?? 0), 0), byStatus },
    workDone: (work.data ?? []).map((w) => w.title), updates: (updates.data ?? []).map((u: any) => ({ project: u.projects?.title ?? "", body: u.body, at: u.created_at })),
    brandGoals: brand.data?.goals ?? null,
  };
}
