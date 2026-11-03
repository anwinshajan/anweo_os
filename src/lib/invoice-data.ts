import { supabaseServer } from "@/lib/supabase-server";
import { effectiveDueDate, isOverdue, isoDay } from "@/lib/payments";
import { invoiceNumber, termsSentence, type InvoiceDoc } from "@/lib/invoice";

// Loads one invoice as a printable document. Row-level security decides who may see it:
// the admin sees everything, a client only their own issued invoices.
export async function loadInvoiceDoc(id: string): Promise<InvoiceDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await supabaseServer();
  const { data: inv } = await sb
    .from("invoices")
    .select("id,invoice_no,period_label,amount,currency,status,issued_at,due_date,paid_at,clients(business_name,contact_name,email,phone,country,address,tax_id,payment_terms_days,late_grace_days,late_interest_percent)")
    .eq("id", id)
    .single();
  if (!inv) return null;
  const { data: co } = await sb.from("company_settings").select("*").eq("id", 1).single();

  const c = inv.clients as unknown as {
    business_name: string; contact_name: string | null; email: string | null; phone: string | null; country: string | null;
    address: string | null; tax_id: string | null; payment_terms_days: number; late_grace_days: number; late_interest_percent: number | string;
  };
  const due = effectiveDueDate({ due_date: inv.due_date, issued_at: inv.issued_at }, c.payment_terms_days);
  const unpaid = inv.status === "due" || inv.status === "overdue";
  return {
    number: invoiceNumber(inv.invoice_no),
    status: inv.status,
    late: unpaid && isOverdue(due, isoDay()),
    issuedAt: inv.issued_at,
    dueAt: due,
    paidAt: inv.paid_at,
    currency: inv.currency,
    amount: Number(inv.amount),
    description: inv.period_label,
    client: { name: c.business_name, contact: c.contact_name, email: c.email, phone: c.phone, address: c.address, taxId: c.tax_id, country: c.country },
    company: {
      legalName: co?.legal_name ?? "Anweo", address: co?.address ?? null, email: co?.email ?? null, phone: co?.phone ?? null,
      website: co?.website ?? null, taxLabel: co?.tax_label ?? "Tax ID", taxNumber: co?.tax_number ?? null,
      paymentDetails: co?.payment_details ?? null, note: co?.invoice_note ?? null, termsConditions: co?.terms_conditions ?? null, upiId: co?.upi_id ?? null, upiName: co?.upi_name ?? null, whatsapp: co?.whatsapp_number ?? null,
    },
    terms: termsSentence(c.payment_terms_days, Number(c.late_interest_percent), c.late_grace_days),
  };
}
