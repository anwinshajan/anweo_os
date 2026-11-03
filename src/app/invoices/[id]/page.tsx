import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import InvoiceSheet from "@/components/InvoiceSheet";
import PrintButton from "@/components/PrintButton";
import Shell from "@/components/Shell";
import { getMe } from "@/lib/supabase-server";
import { loadInvoiceDoc } from "@/lib/invoice-data";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const { id } = await params;
  const doc = await loadInvoiceDoc(id);
  if (!doc) notFound();
  return (
    <Shell me={me}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/" className="text-sm font-medium text-forest hover:underline">← Back</Link>
        <div className="flex gap-2">
          {(doc.status === "due" || doc.status === "overdue") && <Link href={`/invoices/${id}/pay`} className="btn-lime">Pay now</Link>}
          <PrintButton />
          <a href={`/api/invoices/${id}/pdf?download=1`} className="btn-primary">Download PDF</a>
        </div>
      </div>
      <InvoiceSheet doc={doc} />
    </Shell>
  );
}
