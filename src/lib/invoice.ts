// Shared invoice document model. Pure: safe in server and client code.
import { CURRENCIES } from "./currency.ts";

export type InvoiceDoc = {
  number: string;
  status: "draft" | "due" | "overdue" | "paid" | "void";
  late: boolean;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  currency: string;
  amount: number;
  description: string;
  client: { name: string; contact: string | null; email: string | null; phone: string | null; address: string | null; taxId: string | null; country: string | null };
  company: { legalName: string; address: string | null; email: string | null; phone: string | null; website: string | null; taxLabel: string; taxNumber: string | null; paymentDetails: string | null; note: string | null };
  terms: string;
};

export const invoiceNumber = (n: number | null | undefined) => (n ? `ANW-${String(n).padStart(4, "0")}` : "DRAFT");

// In the PDF a currency symbol is only used where the embedded font has the glyph; everything else shows the
// ISO code ("INR 42,000.00"), which is also the clearest for international clients.
const PDF_SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", CAD: "CA$", AUD: "A$", SGD: "S$" };

export function formatMoneyPdf(n: number | string, currency: string): string {
  const locale = CURRENCIES.find((c) => c.code === currency)?.locale ?? "en-GB";
  const num = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
  const sym = PDF_SYMBOL[currency];
  return sym ? `${sym}${num}` : `${currency} ${num}`;
}

export const fileNameFor = (doc: InvoiceDoc) => `Anweo-Invoice-${doc.number}.pdf`;

// The standard-terms sentence printed on the invoice.
export function termsSentence(termsDays: number, lateRate: number, graceDays: number): string {
  const base = `Payment is due within ${termsDays} day${termsDays === 1 ? "" : "s"} of the invoice date.`;
  return lateRate > 0 ? `${base} A late fee of ${lateRate}% of the unpaid amount is added for each full week a payment is overdue, after a ${graceDays}-day grace period.` : base;
}
