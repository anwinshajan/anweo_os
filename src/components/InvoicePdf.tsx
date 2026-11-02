import { Circle, Document, Font, Page, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { PDF_FONTS } from "@/lib/pdf-fonts";
import { formatMoneyPdf, type InvoiceDoc } from "@/lib/invoice";

// Anweo brand colours (from the brand sheet)
const FOREST = "#0E5A44", LIME = "#C9F25A", INK = "#141413", PAPER = "#F4F3EF", EDGE = "#E2E0D8", MUTE = "#6F6F69", RED = "#B42318";

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
  page: { fontFamily: "InterTight", fontSize: 10, color: INK, paddingTop: 0, paddingBottom: 84, paddingHorizontal: 0, backgroundColor: "#FFFFFF" },
  bar: { height: 10, backgroundColor: FOREST },
  body: { paddingHorizontal: 44, paddingTop: 30 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logoRow: { flexDirection: "row", alignItems: "center" },
  wordmark: { marginLeft: 9, fontSize: 13, fontWeight: 700, letterSpacing: 5 },
  titleBox: { alignItems: "flex-end" },
  title: { fontSize: 30, fontWeight: 700, color: FOREST, letterSpacing: -0.5 },
  number: { fontFamily: "Mono", fontSize: 9, color: MUTE, marginTop: 3, letterSpacing: 1 },
  label: { fontFamily: "Mono", fontSize: 6.5, color: MUTE, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 },
  rule: { height: 1, backgroundColor: EDGE, marginTop: 22, marginBottom: 20 },
  cols: { flexDirection: "row", justifyContent: "space-between" },
  col: { width: "47%" },
  strong: { fontSize: 11.5, fontWeight: 700, marginBottom: 3 },
  line: { fontSize: 9.5, color: INK, lineHeight: 1.45 },
  dim: { fontSize: 9, color: MUTE, lineHeight: 1.45 },
  meta: { flexDirection: "row", marginTop: 20 },
  metaBox: { flex: 1, backgroundColor: PAPER, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 11, marginRight: 8 },
  metaVal: { fontSize: 11, fontWeight: 600 },
  th: { flexDirection: "row", backgroundColor: FOREST, borderTopLeftRadius: 6, borderTopRightRadius: 6, paddingVertical: 8, paddingHorizontal: 12, marginTop: 24 },
  thText: { fontFamily: "Mono", fontSize: 7, color: PAPER, letterSpacing: 1.4, textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 15, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: EDGE },
  desc: { flex: 1, paddingRight: 12 },
  descTitle: { fontSize: 11.5, fontWeight: 600 },
  amt: { width: 130, textAlign: "right", fontSize: 11.5, fontWeight: 600 },
  totals: { marginTop: 18, alignSelf: "flex-end", width: 250 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 4 },
  due: { marginTop: 6, backgroundColor: LIME, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 14 },
  dueLabel: { fontFamily: "Mono", fontSize: 7, letterSpacing: 1.6, color: FOREST, textTransform: "uppercase" },
  dueAmt: { fontSize: 23, fontWeight: 700, color: INK, marginTop: 3, letterSpacing: -0.4 },
  section: { marginTop: 22 },
  pre: { fontSize: 9.5, lineHeight: 1.55 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 44, paddingBottom: 26 },
  footLine: { height: 2.5, backgroundColor: LIME, marginBottom: 9 },
  footRow: { flexDirection: "row", justifyContent: "space-between" },
  foot: { fontFamily: "Mono", fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
  badge: { marginTop: 7, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 },
  badgeText: { fontFamily: "Mono", fontSize: 7, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 500 },
});

const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Mark() {
  return (
    <Svg width={34} height={34} viewBox="0 0 48 48">
      <Rect width="48" height="48" rx="12" fill={FOREST} />
      <Rect x="9" y="15" width="21" height="21" rx="6" fill="none" stroke={PAPER} strokeWidth="2.6" />
      <Circle cx="33" cy="14" r="5.2" fill={LIME} />
    </Svg>
  );
}

export default function InvoicePdf({ doc }: { doc: InvoiceDoc }) {
  const paid = doc.status === "paid";
  const badge = paid ? { bg: LIME, fg: FOREST, text: "Paid" } : doc.status === "draft" ? { bg: PAPER, fg: MUTE, text: "Draft" } : doc.status === "void" ? { bg: PAPER, fg: MUTE, text: "Void" } : doc.late ? { bg: "#FDECEA", fg: RED, text: "Overdue" } : null;
  const co = doc.company;
  const contactBits = [co.email, co.phone, co.website].filter(Boolean).join("   ·   ");

  return (
    <Document title={`Invoice ${doc.number}`} author={co.legalName} subject={`Invoice for ${doc.client.name}`}>
      <Page size="A4" style={s.page}>
        <View style={s.bar} fixed />
        <View style={s.body}>
          <View style={s.head}>
            <View style={s.logoRow}><Mark /><Text style={s.wordmark}>ANWEO</Text></View>
            <View style={s.titleBox}>
              <Text style={s.title}>Invoice</Text>
              <Text style={s.number}>{doc.number}</Text>
              {badge && <View style={[s.badge, { backgroundColor: badge.bg }]}><Text style={[s.badgeText, { color: badge.fg }]}>{badge.text}</Text></View>}
            </View>
          </View>

          <View style={s.rule} />

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
            <View style={s.metaBox}><Text style={s.label}>Issue date</Text><Text style={s.metaVal}>{fmtDate(doc.issuedAt)}</Text></View>
            <View style={s.metaBox}><Text style={s.label}>{paid ? "Paid on" : "Due date"}</Text><Text style={s.metaVal}>{paid && doc.paidAt ? fmtDate(doc.paidAt) : fmtDate(doc.dueAt)}</Text></View>
            <View style={[s.metaBox, { marginRight: 0 }]}><Text style={s.label}>Currency</Text><Text style={s.metaVal}>{doc.currency}</Text></View>
          </View>

          <View style={s.th}>
            <Text style={[s.thText, { flex: 1 }]}>Description</Text>
            <Text style={[s.thText, { width: 130, textAlign: "right" }]}>Amount</Text>
          </View>
          <View style={s.tr}>
            <View style={s.desc}><Text style={s.descTitle}>{doc.description}</Text></View>
            <Text style={s.amt}>{formatMoneyPdf(doc.amount, doc.currency)}</Text>
          </View>

          <View style={s.totals}>
            <View style={s.totalRow}><Text style={s.dim}>Subtotal</Text><Text style={s.line}>{formatMoneyPdf(doc.amount, doc.currency)}</Text></View>
            <View style={s.due}>
              <Text style={s.dueLabel}>{paid ? "Paid in full" : "Amount due"}</Text>
              <Text style={s.dueAmt}>{formatMoneyPdf(paid ? doc.amount : doc.amount, doc.currency)}</Text>
              {!paid && <Text style={{ fontFamily: "Mono", fontSize: 7.5, color: FOREST, marginTop: 3 }}>{doc.late ? "Was due " : "Due "}{fmtDate(doc.dueAt)}</Text>}
            </View>
          </View>

          {co.paymentDetails && !paid ? (
            <View style={s.section} wrap={false}>
              <Text style={s.label}>How to pay</Text>
              <Text style={s.pre}>{co.paymentDetails}</Text>
              <Text style={[s.dim, { marginTop: 4 }]}>Please quote {doc.number} as the payment reference.</Text>
            </View>
          ) : null}

          <View style={s.section} wrap={false}>
            <Text style={s.label}>Terms</Text>
            <Text style={s.dim}>{doc.terms}</Text>
            {co.note ? <Text style={[s.dim, { marginTop: 4 }]}>{co.note}</Text> : null}
          </View>
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
