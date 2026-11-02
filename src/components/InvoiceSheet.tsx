import { Logo } from "@/components/Logo";
import { formatMoney } from "@/lib/currency";
import type { InvoiceDoc } from "@/lib/invoice";

const d = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// On-screen / print version of the branded invoice (the PDF uses InvoicePdf with the same layout).
export default function InvoiceSheet({ doc }: { doc: InvoiceDoc }) {
  const paid = doc.status === "paid";
  const co = doc.company;
  return (
    <article className="invoice-sheet mx-auto w-full max-w-[820px] overflow-hidden rounded-xl2 border border-edge bg-white shadow-card print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <div className="h-2.5 bg-forest" />
      <div className="px-6 py-8 sm:px-11">
        <div className="flex items-start justify-between gap-4">
          <Logo />
          <div className="text-right">
            <h1 className="text-3xl font-bold text-forest sm:text-4xl">Invoice</h1>
            <p className="font-mono text-xs tracking-wider text-mute">{doc.number}</p>
            {(paid || doc.late || doc.status === "draft" || doc.status === "void") && (
              <span className={`pill mt-2 ${paid ? "bg-lime text-forest" : doc.late ? "bg-red-50 text-red-700" : "bg-paper text-mute"}`}>{paid ? "Paid" : doc.late ? "Overdue" : doc.status}</span>
            )}
          </div>
        </div>
        <hr className="my-6 border-edge" />
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="tag mb-1.5">Billed to</p>
            <p className="font-bold">{doc.client.name}</p>
            {doc.client.contact && <p className="text-sm">{doc.client.contact}</p>}
            <p className="whitespace-pre-line text-sm text-mute">{doc.client.address || doc.client.country}</p>
            {doc.client.email && <p className="text-sm text-mute">{doc.client.email}</p>}
            {doc.client.phone && <p className="text-sm text-mute">{doc.client.phone}</p>}
            {doc.client.taxId && <p className="text-sm text-mute">Tax ID: {doc.client.taxId}</p>}
          </div>
          <div>
            <p className="tag mb-1.5">From</p>
            <p className="font-bold">{co.legalName}</p>
            {co.address && <p className="whitespace-pre-line text-sm text-mute">{co.address}</p>}
            {co.email && <p className="text-sm text-mute">{co.email}</p>}
            {co.phone && <p className="text-sm text-mute">{co.phone}</p>}
            {co.taxNumber && <p className="text-sm text-mute">{co.taxLabel}: {co.taxNumber}</p>}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {[["Issue date", d(doc.issuedAt)], [paid ? "Paid on" : "Due date", d(paid && doc.paidAt ? doc.paidAt : doc.dueAt)], ["Currency", doc.currency]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-paper px-3 py-2.5"><p className="tag !text-[9px]">{k}</p><p className="mt-0.5 text-sm font-semibold sm:text-base">{v}</p></div>
          ))}
        </div>
        <div className="mt-7 overflow-hidden rounded-xl border border-edge">
          <div className="flex bg-forest px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-paper"><span className="flex-1">Description</span><span>Amount</span></div>
          <div className="flex items-start justify-between gap-4 px-4 py-5"><p className="font-semibold">{doc.description}</p><p className="whitespace-nowrap font-semibold">{formatMoney(doc.amount, doc.currency)}</p></div>
        </div>
        <div className="ml-auto mt-5 w-full max-w-[290px] rounded-xl bg-lime px-4 py-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-forest">{paid ? "Paid in full" : "Amount due"}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-ink">{formatMoney(doc.amount, doc.currency)}</p>
          {!paid && <p className="mt-1 font-mono text-[11px] text-forest">{doc.late ? "Was due " : "Due "}{d(doc.dueAt)}</p>}
        </div>
        {co.paymentDetails && !paid && (
          <div className="mt-7"><p className="tag mb-1.5">How to pay</p><p className="whitespace-pre-line text-sm">{co.paymentDetails}</p><p className="mt-1 text-xs text-mute">Please quote {doc.number} as the payment reference.</p></div>
        )}
        <div className="mt-6"><p className="tag mb-1.5">Terms</p><p className="text-xs text-mute">{doc.terms}</p>{co.note && <p className="mt-1 text-xs text-mute">{co.note}</p>}</div>
      </div>
      <div className="px-6 pb-6 sm:px-11">
        <div className="mb-2 h-0.5 bg-lime" />
        <div className="flex flex-wrap justify-between gap-2 font-mono text-[10.5px] text-mute">
          <span>{[co.legalName, co.email, co.phone, co.website].filter(Boolean).join("  ·  ")}</span><span>Everything digital.</span>
        </div>
      </div>
    </article>
  );
}
