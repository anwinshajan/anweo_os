import { Logo } from "@/components/Logo";
import { formatMoney } from "@/lib/currency";
import QrSvg from "@/components/QrSvg";
import { isUpiId, sealRing, termsList, upiLink, type InvoiceDoc } from "@/lib/invoice";

const d = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// The company seal, drawn as SVG (the PDF draws the same one).
export function SealSvg({ name, size = 110 }: { name: string; size?: number }) {
  const top = sealRing(name.slice(0, 26), "top");
  const bottom = sealRing("OFFICIAL SEAL", "bottom", 110);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Company seal" className="text-forest">
      <g transform="rotate(-10 60 60)" fill="none" stroke="currentColor">
        <circle cx="60" cy="60" r="57" strokeWidth="2.4" /><circle cx="60" cy="60" r="53" strokeWidth="0.8" />
        <circle cx="60" cy="60" r="33" strokeWidth="1.4" /><circle cx="60" cy="60" r="30.5" strokeWidth="0.6" />
        {top.map((c, i) => <g key={`t${i}`} transform={`rotate(${c.rot} 60 60)`}><text x="60" y="22" textAnchor="middle" fill="currentColor" stroke="none" fontSize="9.5" fontWeight="700">{c.ch}</text></g>)}
        {bottom.map((c, i) => <g key={`b${i}`} transform={`rotate(${c.rot} 60 60)`}><text x="60" y="103" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="500">{c.ch}</text></g>)}
        <g transform="translate(46 43) scale(0.58)" strokeWidth="3"><rect x="1.5" y="1.5" width="45" height="45" rx="12" /><rect x="9" y="15" width="21" height="21" rx="6" /><circle cx="33" cy="14" r="5.2" fill="currentColor" stroke="none" /></g>
        <text x="60" y="77" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.5" fontWeight="700">ANWEO</text>
      </g>
    </svg>
  );
}

// On-screen / print version of the branded invoice (the PDF uses InvoicePdf with the same layout).
export default function InvoiceSheet({ doc }: { doc: InvoiceDoc }) {
  const paid = doc.status === "paid";
  const co = doc.company;
  const terms = termsList(co.termsConditions);
  const upi = !paid && doc.currency === "INR" && isUpiId(co.upiId);
  return (
    <article className="invoice-sheet mx-auto w-full max-w-[820px] overflow-hidden rounded-xl2 border border-edge bg-white shadow-card print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="flex items-center justify-between gap-4 bg-forest px-6 py-6 text-paper sm:px-11">
        <div className="[&_*]:!text-paper"><Logo /><p className="mt-1 font-mono text-[10px] tracking-widest !text-lime">Everything digital.</p></div>
        <div className="text-right">
          <h1 className="text-3xl font-bold tracking-[0.12em] sm:text-4xl">INVOICE</h1>
          <p className="font-mono text-xs tracking-widest text-lime">{doc.number}</p>
          {(paid || doc.late || doc.status === "draft" || doc.status === "void") && (
            <span className={`pill mt-2 ${paid ? "bg-lime text-forest" : doc.late ? "bg-red-50 text-red-700" : "bg-paper text-mute"}`}>{paid ? "Paid" : doc.late ? "Overdue" : doc.status}</span>
          )}
        </div>
      </header>
      <div className="h-1 bg-lime" />
      <div className="px-6 py-7 sm:px-11">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="tag mb-1.5 !text-forest">Billed to</p>
            <p className="text-base font-bold">{doc.client.name}</p>
            {doc.client.contact && <p className="text-sm">{doc.client.contact}</p>}
            <p className="whitespace-pre-line text-sm text-mute">{doc.client.address || doc.client.country}</p>
            {doc.client.email && <p className="text-sm text-mute">{doc.client.email}</p>}
            {doc.client.phone && <p className="text-sm text-mute">{doc.client.phone}</p>}
            {doc.client.taxId && <p className="text-sm text-mute">Tax ID: {doc.client.taxId}</p>}
          </div>
          <div>
            <p className="tag mb-1.5 !text-forest">From</p>
            <p className="text-base font-bold">{co.legalName}</p>
            {co.address && <p className="whitespace-pre-line text-sm text-mute">{co.address}</p>}
            {co.email && <p className="text-sm text-mute">{co.email}</p>}
            {co.phone && <p className="text-sm text-mute">{co.phone}</p>}
            {co.taxNumber && <p className="text-sm text-mute">{co.taxLabel}: {co.taxNumber}</p>}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-y-3 border-y border-edge py-3 sm:grid-cols-4">
          {[["Invoice no.", doc.number], ["Issue date", d(doc.issuedAt)], [paid ? "Paid on" : "Due date", d(paid && doc.paidAt ? doc.paidAt : doc.dueAt)], ["Currency", doc.currency]].map(([k, v]) => (
            <div key={k}><p className="tag !text-[9px] !text-forest">{k}</p><p className="mt-0.5 text-sm font-semibold sm:text-base">{v}</p></div>
          ))}
        </div>
        <div className="mt-6">
          <div className="flex justify-between border-b-2 border-lime bg-paper px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-forest"><span>Description</span><span>Amount</span></div>
          <div className="flex items-start justify-between gap-4 border-b border-edge px-4 py-4"><p className="font-semibold">{doc.description}</p><p className="whitespace-nowrap font-semibold">{formatMoney(doc.amount, doc.currency)}</p></div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {!paid && (co.paymentDetails || upi) ? (
            <div className="rounded-xl bg-paper p-4">
              <p className="tag mb-1.5 !text-forest">How to pay</p>
              {co.paymentDetails && <p className="whitespace-pre-line text-sm">{co.paymentDetails}</p>}
              {upi && (
                <div className="mt-2 flex items-center gap-3">
                  <QrSvg text={upiLink({ vpa: co.upiId!, name: co.upiName, amount: doc.amount, note: `Invoice ${doc.number}` })} size={84} className="shrink-0 rounded-lg" />
                  <div className="text-xs"><p className="text-sm font-semibold">Scan with any UPI app</p><p className="text-mute">Amount is filled in.</p><p className="font-mono text-mute">{co.upiId}</p></div>
                </div>
              )}
              <p className="mt-1.5 text-xs text-mute">Quote {doc.number} as the payment reference.</p>
            </div>
          ) : <div />}
          <div>
            <div className="flex justify-between px-1 pb-2 text-sm"><span className="text-mute">Subtotal</span><span>{formatMoney(doc.amount, doc.currency)}</span></div>
            <div className={`rounded-xl px-4 py-4 ${paid ? "bg-lime text-ink" : "bg-forest text-paper"}`}>
              <p className={`font-mono text-[10px] uppercase tracking-widest ${paid ? "text-forest" : "text-lime"}`}>{paid ? "Paid in full" : "Amount due"}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight">{formatMoney(doc.amount, doc.currency)}</p>
              {!paid && <p className="mt-1 font-mono text-[11px] text-lime">{doc.late ? "Was due " : "Due "}{d(doc.dueAt)}</p>}
            </div>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-sm"><p className="tag mb-1.5 !text-forest">Payment terms</p><p className="text-xs text-mute">{doc.terms}</p>{co.note && <p className="mt-1 text-xs text-mute">{co.note}</p>}</div>
          <div className="flex w-52 flex-col items-center">
            <SealSvg name={co.legalName} />
            <div className="mt-1 h-px w-full bg-ink" />
            <p className="mt-1 text-xs font-semibold">Authorised signatory</p><p className="text-xs text-mute">{co.legalName}</p>
          </div>
        </div>
        {terms.length > 0 && (
          <div className="mt-7">
            <p className="tag mb-2 !text-forest">Terms &amp; conditions</p>
            <ol className="space-y-1">{terms.map((t, i) => <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-mute"><span className="font-mono text-forest">{String(i + 1).padStart(2, "0")}</span><span>{t}</span></li>)}</ol>
          </div>
        )}
      </div>
      <div className="px-6 pb-6 sm:px-11">
        <div className="mb-2 h-0.5 bg-lime" />
        <div className="flex flex-wrap justify-between gap-2 font-mono text-[10.5px] text-mute"><span>{[co.legalName, co.email, co.phone, co.website].filter(Boolean).join("  ·  ")}</span><span>Everything digital.</span></div>
      </div>
    </article>
  );
}
