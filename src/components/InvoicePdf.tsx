import { Circle, Document, Font, G, Page, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { PDF_FONTS } from "@/lib/pdf-fonts";
import { formatMoneyPdf, sealRing, termsList, type InvoiceDoc } from "@/lib/invoice";

// Anweo brand colours (from the brand sheet)
const FOREST = "#0E5A44", FOREST_DEEP = "#0A4433", LIME = "#C9F25A", INK = "#141413", PAPER = "#F4F3EF", EDGE = "#E2E0D8", MUTE = "#6F6F69", RED = "#B42318";

Font.register({
  family: "InterTight",
  fonts: [
    { src: PDF_FONTS.interTight400, fontWeight: 400 },
    { src: PDF_FONTS.interTight600, fontWeight: 600 },
    { src: PDF_FONTS.interTight700, fontWeight: 700 },
  ],
});
Font.register({ family: "Mono", fonts: [{ src: PDF_FONTS.mono400, fontWeight: 400 }, { src: PDF_FONTS.mono500, fontWeight: 500 }] });
Font.registerHyphenationCallback((w) => [w]);

const s = StyleSheet.create({
  page: { fontFamily: "InterTight", fontSize: 10, color: INK, paddingBottom: 56, backgroundColor: "#FFFFFF" },
  header: { backgroundColor: FOREST, paddingHorizontal: 44, paddingTop: 22, paddingBottom: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logoRow: { flexDirection: "row", alignItems: "center" },
  wordmark: { marginLeft: 10, fontSize: 14, fontWeight: 700, letterSpacing: 5, color: PAPER },
  tagline: { marginLeft: 10, marginTop: 3, fontFamily: "Mono", fontSize: 7, letterSpacing: 1.4, color: LIME },
  title: { fontSize: 30, fontWeight: 700, color: PAPER, letterSpacing: 4, textAlign: "right" },
  number: { fontFamily: "Mono", fontSize: 10, color: LIME, marginTop: 4, letterSpacing: 1.5, textAlign: "right" },
  accent: { height: 4, backgroundColor: LIME },
  body: { paddingHorizontal: 44, paddingTop: 16 },
  cols: { flexDirection: "row", justifyContent: "space-between" },
  col: { width: "47%" },
  label: { fontFamily: "Mono", fontSize: 6.5, color: FOREST, letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 5, fontWeight: 500 },
  strong: { fontSize: 12, fontWeight: 700, marginBottom: 3 },
  line: { fontSize: 9.5, lineHeight: 1.45 },
  dim: { fontSize: 9, color: MUTE, lineHeight: 1.5 },
  meta: { flexDirection: "row", marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: EDGE },
  metaBox: { flex: 1, paddingVertical: 10, paddingHorizontal: 4 },
  metaVal: { fontSize: 11, fontWeight: 600 },
  th: { flexDirection: "row", backgroundColor: PAPER, paddingVertical: 8, paddingHorizontal: 12, marginTop: 14, borderBottomWidth: 2, borderBottomColor: LIME },
  thText: { fontFamily: "Mono", fontSize: 7, color: FOREST, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 500 },
  tr: { flexDirection: "row", paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: EDGE },
  desc: { flex: 1, paddingRight: 12 },
  descTitle: { fontSize: 11.5, fontWeight: 600 },
  amt: { width: 130, textAlign: "right", fontSize: 11.5, fontWeight: 600 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 12 },
  payBox: { width: "50%", backgroundColor: PAPER, borderRadius: 8, padding: 13 },
  totals: { width: 235 },
  subRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 7 },
  due: { backgroundColor: FOREST, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 14 },
  dueLabel: { fontFamily: "Mono", fontSize: 7, letterSpacing: 1.6, color: LIME, textTransform: "uppercase" },
  dueAmt: { fontSize: 22, fontWeight: 700, color: PAPER, marginTop: 4, letterSpacing: -0.4 },
  dueSub: { fontFamily: "Mono", fontSize: 7.5, color: LIME, marginTop: 4 },
  signRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 10 },
  signBox: { width: 190, alignItems: "center" },
  signLine: { width: 190, height: 1, backgroundColor: INK, marginTop: 4 },
  section: { marginTop: 8 },
  term: { flexDirection: "row", marginBottom: 2 },
  termNo: { width: 14, fontFamily: "Mono", fontSize: 7.5, color: FOREST },
  termTxt: { flex: 1, fontSize: 7.4, color: MUTE, lineHeight: 1.5 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 44, paddingBottom: 24 },
  footLine: { height: 2.5, backgroundColor: LIME, marginBottom: 8 },
  footRow: { flexDirection: "row", justifyContent: "space-between" },
  foot: { fontFamily: "Mono", fontSize: 7.5, color: MUTE },
  badge: { marginTop: 7, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20, alignSelf: "flex-end" },
  badgeText: { fontFamily: "Mono", fontSize: 7, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 500 },
});

const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Mark({ size = 34, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {onDark ? <Rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="none" stroke={PAPER} strokeWidth="2.4" /> : <Rect width="48" height="48" rx="12" fill={FOREST} />}
      <Rect x="9" y="15" width="21" height="21" rx="6" fill="none" stroke={PAPER} strokeWidth="2.6" />
      <Circle cx="33" cy="14" r="5.2" fill={LIME} />
    </Svg>
  );
}

// The company seal: two rings, the name around the top, "official seal" around the bottom and the brand mark in the middle.
function Seal({ name }: { name: string }) {
  const top = sealRing(name.slice(0, 26), "top");
  const bottom = sealRing("OFFICIAL SEAL", "bottom", 110);
  return (
    <Svg width={96} height={96} viewBox="0 0 120 120">
      <G transform="rotate(-10 60 60)">
        <Circle cx="60" cy="60" r="57" fill="none" stroke={FOREST} strokeWidth="2.4" />
        <Circle cx="60" cy="60" r="53" fill="none" stroke={FOREST} strokeWidth="0.8" />
        <Circle cx="60" cy="60" r="33" fill="none" stroke={FOREST} strokeWidth="1.4" />
        <Circle cx="60" cy="60" r="30.5" fill="none" stroke={FOREST} strokeWidth="0.6" />
        {top.map((c, i) => (
          <G key={`t${i}`} transform={`rotate(${c.rot} 60 60)`}>
            <Text x="60" y="22" textAnchor="middle" fill={FOREST} style={{ fontFamily: "InterTight", fontWeight: 700, fontSize: 9.5 }}>{c.ch}</Text>
          </G>
        ))}
        {bottom.map((c, i) => (
          <G key={`b${i}`} transform={`rotate(${c.rot} 60 60)`}>
            <Text x="60" y="103" textAnchor="middle" fill={FOREST} style={{ fontFamily: "Mono", fontWeight: 500, fontSize: 7.5 }}>{c.ch}</Text>
          </G>
        ))}
        <G transform="translate(46 43) scale(0.58)">
          <Rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="none" stroke={FOREST} strokeWidth="3" />
          <Rect x="9" y="15" width="21" height="21" rx="6" fill="none" stroke={FOREST} strokeWidth="3" />
          <Circle cx="33" cy="14" r="5.2" fill={FOREST} />
        </G>
        <Text x="60" y="77" textAnchor="middle" fill={FOREST} style={{ fontFamily: "InterTight", fontWeight: 700, fontSize: 6.5 }}>ANWEO</Text>
      </G>
    </Svg>
  );
}

export default function InvoicePdf({ doc }: { doc: InvoiceDoc }) {
  const paid = doc.status === "paid";
  const badge = paid ? { bg: LIME, fg: FOREST, text: "Paid" } : doc.status === "draft" ? { bg: PAPER, fg: MUTE, text: "Draft" } : doc.status === "void" ? { bg: PAPER, fg: MUTE, text: "Void" } : doc.late ? { bg: "#FDECEA", fg: RED, text: "Overdue" } : null;
  const co = doc.company;
  const contactBits = [co.email, co.phone, co.website].filter(Boolean).join("   ·   ");
  const terms = termsList(co.termsConditions);

  return (
    <Document title={`Invoice ${doc.number}`} author={co.legalName} subject={`Invoice for ${doc.client.name}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.logoRow}>
            <Mark size={38} onDark />
            <View><Text style={s.wordmark}>ANWEO</Text><Text style={s.tagline}>Everything digital.</Text></View>
          </View>
          <View>
            <Text style={s.title}>INVOICE</Text>
            <Text style={s.number}>{doc.number}</Text>
            {badge && <View style={[s.badge, { backgroundColor: badge.bg }]}><Text style={[s.badgeText, { color: badge.fg }]}>{badge.text}</Text></View>}
          </View>
        </View>
        <View style={s.accent} />

        <View style={s.body}>
          <View style={s.cols}>
            <View style={s.col}>
              <Text style={s.label}>Billed to</Text>
              <Text style={s.strong}>{doc.client.name}</Text>
              {doc.client.contact ? <Text style={s.line}>{doc.client.contact}</Text> : null}
              {doc.client.address ? <Text style={s.dim}>{doc.client.address}</Text> : doc.client.country ? <Text style={s.dim}>{doc.client.country}</Text> : null}
              {doc.client.email ? <Text style={s.dim}>{doc.client.email}</Text> : null}
              {doc.client.phone ? <Text style={s.dim}>{doc.client.phone}</Text> : null}
              {doc.client.taxId ? <Text style={s.dim}>Tax ID: {doc.client.taxId}</Text> : null}
            </View>
            <View style={s.col}>
              <Text style={s.label}>From</Text>
              <Text style={s.strong}>{co.legalName}</Text>
              {co.address ? <Text style={s.dim}>{co.address}</Text> : null}
              {co.email ? <Text style={s.dim}>{co.email}</Text> : null}
              {co.phone ? <Text style={s.dim}>{co.phone}</Text> : null}
              {co.taxNumber ? <Text style={s.dim}>{co.taxLabel}: {co.taxNumber}</Text> : null}
            </View>
          </View>

          <View style={s.meta}>
            <View style={s.metaBox}><Text style={s.label}>Invoice no.</Text><Text style={s.metaVal}>{doc.number}</Text></View>
            <View style={s.metaBox}><Text style={s.label}>Issue date</Text><Text style={s.metaVal}>{fmtDate(doc.issuedAt)}</Text></View>
            <View style={s.metaBox}><Text style={s.label}>{paid ? "Paid on" : "Due date"}</Text><Text style={s.metaVal}>{paid && doc.paidAt ? fmtDate(doc.paidAt) : fmtDate(doc.dueAt)}</Text></View>
            <View style={s.metaBox}><Text style={s.label}>Currency</Text><Text style={s.metaVal}>{doc.currency}</Text></View>
          </View>

          <View style={s.th}>
            <Text style={[s.thText, { flex: 1 }]}>Description</Text>
            <Text style={[s.thText, { width: 130, textAlign: "right" }]}>Amount</Text>
          </View>
          <View style={s.tr}>
            <View style={s.desc}><Text style={s.descTitle}>{doc.description}</Text></View>
            <Text style={s.amt}>{formatMoneyPdf(doc.amount, doc.currency)}</Text>
          </View>

          <View style={s.totalsRow} wrap={false}>
            {co.paymentDetails && !paid ? (
              <View style={s.payBox}>
                <Text style={s.label}>How to pay</Text>
                <Text style={{ fontSize: 9.5, lineHeight: 1.55 }}>{co.paymentDetails}</Text>
                <Text style={[s.dim, { marginTop: 5 }]}>Quote {doc.number} as the payment reference.</Text>
              </View>
            ) : <View style={{ width: "50%" }} />}
            <View style={s.totals}>
              <View style={s.subRow}><Text style={s.dim}>Subtotal</Text><Text style={s.line}>{formatMoneyPdf(doc.amount, doc.currency)}</Text></View>
              <View style={[s.due, paid ? { backgroundColor: LIME } : {}]}>
                <Text style={[s.dueLabel, paid ? { color: FOREST } : {}]}>{paid ? "Paid in full" : "Amount due"}</Text>
                <Text style={[s.dueAmt, paid ? { color: INK } : {}]}>{formatMoneyPdf(doc.amount, doc.currency)}</Text>
                {!paid && <Text style={s.dueSub}>{doc.late ? "Was due " : "Due "}{fmtDate(doc.dueAt)}</Text>}
              </View>
            </View>
          </View>

          <View style={s.signRow} wrap={false}>
            <View style={{ width: "55%" }}>
              <Text style={s.label}>Payment terms</Text>
              <Text style={s.dim}>{doc.terms}</Text>
              {co.note ? <Text style={[s.dim, { marginTop: 4 }]}>{co.note}</Text> : null}
            </View>
            <View style={s.signBox}>
              <Seal name={co.legalName} />
              <View style={s.signLine} />
              <Text style={{ fontSize: 8.5, fontWeight: 600, marginTop: 3 }}>Authorised signatory</Text>
              <Text style={s.dim}>{co.legalName}</Text>
            </View>
          </View>

          {terms.length > 0 && (
            <View style={s.section} wrap={false}>
              <Text style={s.label}>Terms &amp; conditions</Text>
              {terms.map((t, i) => (
                <View key={i} style={s.term}><Text style={s.termNo}>{String(i + 1).padStart(2, "0")}</Text><Text style={s.termTxt}>{t}</Text></View>
              ))}
            </View>
          )}
        </View>

        <View style={s.footer} fixed>
          <View style={s.footLine} />
          <View style={s.footRow}>
            <Text style={s.foot}>{co.legalName}{contactBits ? `   ·   ${contactBits}` : ""}</Text>
            <Text style={s.foot}>Everything digital.</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
