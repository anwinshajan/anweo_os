import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Form from "@/components/Form";
import QrSvg from "@/components/QrSvg";
import CopyButton from "@/components/CopyButton";
import Shell from "@/components/Shell";
import { reportPaymentAction } from "@/app/actions";
import { getMe } from "@/lib/supabase-server";
import { loadInvoiceDoc } from "@/lib/invoice-data";
import { formatMoney } from "@/lib/currency";
import { isUpiId, upiLink, whatsappLink, whatsappPayMessage } from "@/lib/invoice";

export const dynamic = "force-dynamic";

export default async function PayInvoice({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const { id } = await params;
  const doc = await loadInvoiceDoc(id);
  if (!doc) notFound();
  const co = doc.company;
  const amountText = formatMoney(doc.amount, doc.currency);
  const open = doc.status === "due" || doc.status === "overdue";
  const inr = doc.currency === "INR";
  const upi = inr && isUpiId(co.upiId) ? upiLink({ vpa: co.upiId, name: co.upiName, amount: doc.amount, note: `Invoice ${doc.number}` }) : null;
  const wa = !inr ? whatsappLink(co.whatsapp, whatsappPayMessage(doc, amountText)) : null;

  return (
    <Shell me={me}>
      <Link href={`/invoices/${id}`} className="tag hover:text-forest">← Invoice {doc.number}</Link>
      <div className="mx-auto mt-4 max-w-md space-y-5">
        <section className="card-green text-center">
          <p className="tag !text-lime">{doc.number} · {doc.description}</p>
          <p className="mt-2 text-4xl font-bold tracking-tight">{amountText}</p>
          <p className="mt-1 text-sm text-paper/70">{open ? (doc.late ? "Overdue" : "Payment due") : doc.status === "paid" ? "Paid, thank you" : doc.status}</p>
        </section>

        {!open ? (
          <section className="card text-center text-sm text-mute">{doc.status === "paid" ? "This invoice has been paid. Nothing more to do." : "This invoice can't be paid right now."}</section>
        ) : inr ? (
          upi ? (
            <section className="card space-y-4 text-center">
              <a href={upi} className="btn-primary w-full !py-4 text-base">Pay {amountText} with a UPI app</a>
              <p className="text-xs text-mute">Opens Google Pay, PhonePe, Paytm or your bank app with the amount already filled in.</p>
              <div className="border-t border-edge pt-4">
                <p className="text-sm font-semibold">On a computer? Scan to pay</p>
                <QrSvg text={upi} size={200} className="mx-auto mt-2 rounded-xl border border-edge" />
                <p className="mt-2 text-xs text-mute">Scan with any UPI app. The amount is filled in.</p>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3.5 py-2.5 text-left text-sm">
                <span className="min-w-0"><span className="tag block">UPI ID</span><span className="break-all font-mono">{co.upiId}</span></span>
                <CopyButton text={co.upiId!} />
              </div>
            </section>
          ) : (
            <section className="card text-center text-sm text-mute">UPI payment isn't set up yet. Please message the team in <Link href="/chat" className="font-medium text-forest hover:underline">Chat</Link> and we'll send the details.</section>
          )
        ) : (
          <section className="card space-y-3 text-center">
            <p className="text-sm text-ink/80">For {doc.currency} payments, message us on WhatsApp and we'll tell you the easiest way to pay.</p>
            {wa ? <a href={wa} target="_blank" rel="noreferrer" className="btn-primary w-full !py-4 text-base">Message us on WhatsApp</a>
              : <Link href="/chat" className="btn-primary w-full !py-4 text-base">Chat with the team</Link>}
            <p className="text-xs text-mute">The message is already typed for you: it asks how to pay your {doc.currency} amount.</p>
          </section>
        )}

        {open && (
          <section className="card">
            <p className="font-semibold">Already paid?</p>
            <p className="mb-3 text-sm text-mute">Let us know and we'll confirm it as soon as it arrives.</p>
            <Form action={reportPaymentAction} className="space-y-2">
              <input type="hidden" name="id" value={id} />
              <input name="reference" placeholder="Transaction / UTR reference (optional)" className="input" />
              <button className="btn-ghost w-full">I've paid</button>
            </Form>
          </section>
        )}
      </div>
    </Shell>
  );
}
