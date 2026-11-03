import { Circle, Document, Page, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { setupPdfFonts } from "@/lib/pdf-setup";
import { formatMoneyPdf } from "@/lib/invoice";
import type { Report } from "@/lib/report-data";

const FOREST = "#0E5A44", LIME = "#C9F25A", INK = "#141413", PAPER = "#F4F3EF", EDGE = "#E2E0D8", MUTE = "#6F6F69";
setupPdfFonts();

const s = StyleSheet.create({
  page: { fontFamily: "InterTight", fontSize: 10, color: INK, paddingBottom: 60, backgroundColor: "#FFFFFF" },
  header: { backgroundColor: FOREST, paddingHorizontal: 44, paddingTop: 26, paddingBottom: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  wordmark: { marginLeft: 10, fontSize: 14, fontWeight: 700, letterSpacing: 5, color: PAPER },
  kicker: { fontFamily: "Mono", fontSize: 8, letterSpacing: 2, color: LIME, textAlign: "right", textTransform: "uppercase" },
  month: { fontSize: 24, fontWeight: 700, color: PAPER, textAlign: "right", marginTop: 4 },
  accent: { height: 4, backgroundColor: LIME },
  body: { paddingHorizontal: 44, paddingTop: 22 },
  client: { fontSize: 20, fontWeight: 700 },
  sub: { fontSize: 9.5, color: MUTE, marginTop: 3 },
  kpis: { flexDirection: "row", marginTop: 18 },
  kpi: { flex: 1, backgroundColor: PAPER, borderRadius: 8, padding: 12, marginRight: 8 },
  kpiDark: { backgroundColor: FOREST },
  kpiLabel: { fontFamily: "Mono", fontSize: 6.5, letterSpacing: 1.4, color: MUTE, textTransform: "uppercase" },
  kpiVal: { fontSize: 22, fontWeight: 700, marginTop: 5 },
  kpiNote: { fontFamily: "Mono", fontSize: 7, color: MUTE, marginTop: 3 },
  h: { fontFamily: "Mono", fontSize: 7.5, letterSpacing: 1.6, color: FOREST, textTransform: "uppercase", marginTop: 22, marginBottom: 7, fontWeight: 500 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: EDGE },
  th: { fontFamily: "Mono", fontSize: 6.5, color: MUTE, letterSpacing: 1.2, textTransform: "uppercase" },
  cell: { fontSize: 9.5 },
  dim: { fontSize: 9, color: MUTE, lineHeight: 1.5 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: FOREST, marginTop: 4, marginRight: 8 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 44, paddingBottom: 22 },
  footLine: { height: 2.5, backgroundColor: LIME, marginBottom: 7 },
  foot: { fontFamily: "Mono", fontSize: 7.5, color: MUTE, flexDirection: "row", justifyContent: "space-between" },
});

const nf = (v: number | null) => (v === null ? "–" : Number(v).toLocaleString("en-GB"));
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function Mark() {
  return (
    <Svg width={36} height={36} viewBox="0 0 48 48">
      <Rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="none" stroke={PAPER} strokeWidth="2.4" />
      <Rect x="9" y="15" width="21" height="21" rx="6" fill="none" stroke={PAPER} strokeWidth="2.6" />
      <Circle cx="33" cy="14" r="5.2" fill={LIME} />
    </Svg>
  );
}

export default function ReportPdf({ r, company }: { r: Report; company: string }) {
  const reach = r.metrics.reduce((a, m) => a + (m.reach ?? 0), 0);
  const followers = r.metrics.reduce((a, m) => a + (m.followers ?? 0), 0);
  const prevFollowers = r.metrics.reduce((a, m) => a + (m.prevFollowers ?? 0), 0);
  const hasPrev = r.metrics.some((m) => m.prevFollowers !== null);
  const delta = followers - prevFollowers;
  const spend: Record<string, number> = {};
  for (const m of r.metrics) if (m.ad_spend) spend[m.ad_currency ?? r.client.currency] = (spend[m.ad_currency ?? r.client.currency] ?? 0) + m.ad_spend;
  const notes = r.metrics.map((m) => m.notes).filter(Boolean) as string[];

  return (
    <Document title={`${r.client.name} · ${r.label} report`} author={company}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={{ flexDirection: "row", alignItems: "center" }}><Mark /><Text style={s.wordmark}>ANWEO</Text></View>
          <View><Text style={s.kicker}>Monthly report</Text><Text style={s.month}>{r.label}</Text></View>
        </View>
        <View style={s.accent} />
        <View style={s.body}>
          <Text style={s.client}>{r.client.name}</Text>
          <Text style={s.sub}>What we did, what it achieved and what comes next.</Text>

          <View style={s.kpis}>
            <View style={[s.kpi, s.kpiDark]}><Text style={[s.kpiLabel, { color: LIME }]}>Posts published</Text><Text style={[s.kpiVal, { color: PAPER }]}>{r.published.length}</Text><Text style={[s.kpiNote, { color: LIME }]}>{r.scheduledCount + r.approvedCount} more lined up</Text></View>
            <View style={s.kpi}><Text style={s.kpiLabel}>Total reach</Text><Text style={s.kpiVal}>{r.metrics.length ? nf(reach) : "–"}</Text><Text style={s.kpiNote}>people who saw our content</Text></View>
            <View style={s.kpi}><Text style={s.kpiLabel}>Followers</Text><Text style={s.kpiVal}>{r.metrics.length ? nf(followers) : "–"}</Text><Text style={s.kpiNote}>{hasPrev ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString("en-GB")} vs last month` : "this month"}</Text></View>
            <View style={[s.kpi, { marginRight: 0 }]}><Text style={s.kpiLabel}>New leads</Text><Text style={s.kpiVal}>{r.leads.total}</Text><Text style={s.kpiNote}>{r.leads.won} won</Text></View>
          </View>

          {r.published.length > 0 && (
            <View wrap={false}>
              <Text style={s.h}>Content published</Text>
              {r.published.slice(0, 14).map((p, i) => (
                <View key={i} style={s.row}><Text style={[s.cell, { width: 52, color: MUTE }]}>{day(p.at)}</Text><Text style={[s.cell, { flex: 1 }]}>{p.title}</Text><Text style={[s.cell, { width: 110, color: MUTE, textAlign: "right", textTransform: "capitalize" }]}>{p.kind} · {p.platform}</Text></View>
              ))}
              {r.published.length > 14 && <Text style={[s.dim, { marginTop: 5 }]}>+ {r.published.length - 14} more published this month.</Text>}
            </View>
          )}

          {r.metrics.length > 0 && (
            <View wrap={false}>
              <Text style={s.h}>Results</Text>
              <View style={s.row}><Text style={[s.th, { flex: 1 }]}>Platform</Text><Text style={[s.th, { width: 62, textAlign: "right" }]}>Followers</Text><Text style={[s.th, { width: 62, textAlign: "right" }]}>Reach</Text><Text style={[s.th, { width: 70, textAlign: "right" }]}>Impressions</Text><Text style={[s.th, { width: 70, textAlign: "right" }]}>Engagement</Text></View>
              {r.metrics.map((m, i) => (
                <View key={i} style={s.row}><Text style={[s.cell, { flex: 1, textTransform: "capitalize" }]}>{m.platform === "all" ? "All platforms" : m.platform}</Text><Text style={[s.cell, { width: 62, textAlign: "right" }]}>{nf(m.followers)}</Text><Text style={[s.cell, { width: 62, textAlign: "right" }]}>{nf(m.reach)}</Text><Text style={[s.cell, { width: 70, textAlign: "right" }]}>{nf(m.impressions)}</Text><Text style={[s.cell, { width: 70, textAlign: "right" }]}>{nf(m.engagement)}</Text></View>
              ))}
              {Object.keys(spend).length > 0 && <Text style={[s.dim, { marginTop: 6 }]}>Ad spend: {Object.entries(spend).map(([c, v]) => formatMoneyPdf(v, c)).join("  ·  ")}</Text>}
            </View>
          )}

          {r.leads.total > 0 && (
            <View wrap={false}>
              <Text style={s.h}>Leads</Text>
              <Text style={s.cell}>{r.leads.total} enquiries came in: {["new", "contacted", "qualified", "won", "lost"].filter((k) => r.leads.byStatus[k]).map((k) => `${r.leads.byStatus[k]} ${k}`).join(", ")}.{r.leads.wonValue > 0 ? ` Won business worth ${formatMoneyPdf(r.leads.wonValue, r.client.currency)}.` : ""}</Text>
            </View>
          )}

          {(notes.length > 0 || r.workDone.length > 0 || r.updates.length > 0) && (
            <View wrap={false}>
              <Text style={s.h}>Highlights and work completed</Text>
              {[...notes, ...r.workDone.map((w) => `Completed: ${w}`), ...r.updates.map((u) => `${u.project ? `${u.project}: ` : ""}${u.body}`)].slice(0, 14).map((t, i) => (
                <View key={i} style={s.bullet}><View style={s.dot} /><Text style={[s.cell, { flex: 1 }]}>{t}</Text></View>
              ))}
            </View>
          )}

          {r.brandGoals && (
            <View wrap={false} style={{ marginTop: 18, backgroundColor: PAPER, borderRadius: 8, padding: 12 }}>
              <Text style={[s.kpiLabel, { color: FOREST }]}>Our goals together</Text>
              <Text style={[s.cell, { marginTop: 4, lineHeight: 1.5 }]}>{r.brandGoals}</Text>
            </View>
          )}
        </View>

        <View style={s.footer} fixed>
          <View style={s.footLine} />
          <View style={s.foot}><Text>{company}</Text><Text>Everything digital.</Text></View>
        </View>
      </Page>
    </Document>
  );
}
