import { redirect } from "next/navigation";
import Shell, { PageHead } from "@/components/Shell";
import { saveCompanySettingsAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role !== "admin") redirect("/");
  const sb = await supabaseServer();
  const { data: c } = await sb.from("company_settings").select("*").eq("id", 1).single();
  const f = (k: string) => (c as Record<string, string | null> | null)?.[k] ?? "";
  return (
    <Shell me={me}>
      <PageHead tag="Admin" title="Company settings" sub="Printed on every invoice." />
      <form action={saveCompanySettingsAction} className="card grid gap-3 sm:grid-cols-2">
        <div><label className="label">Business name *</label><input name="legal_name" required defaultValue={f("legal_name") || "Anweo"} className="input" /></div>
        <div><label className="label">Website</label><input name="website" defaultValue={f("website")} className="input" /></div>
        <div><label className="label">Email</label><input name="email" type="email" defaultValue={f("email")} className="input" /></div>
        <div><label className="label">Phone</label><input name="phone" defaultValue={f("phone")} className="input" /></div>
        <div className="sm:col-span-2"><label className="label">Address</label><textarea name="address" rows={3} defaultValue={f("address")} className="input" /></div>
        <div><label className="label">Tax number label</label><input name="tax_label" defaultValue={f("tax_label") || "Tax ID"} placeholder="VAT No. / GSTIN" className="input" /></div>
        <div><label className="label">Tax number</label><input name="tax_number" defaultValue={f("tax_number")} className="input" /></div>
        <div className="sm:col-span-2"><label className="label">How to pay (bank / UPI details)</label><textarea name="payment_details" rows={4} defaultValue={f("payment_details")} className="input" /></div>
        <div className="sm:col-span-2"><label className="label">Note at the bottom</label><input name="invoice_note" defaultValue={f("invoice_note")} placeholder="Thank you for your business." className="input" /></div>
        <p className="text-xs text-mute sm:col-span-2">Invoices show your tax number but do not calculate VAT/GST. Add it into the amount if it applies.</p>
        <div className="sm:col-span-2"><button className="btn-primary">Save settings</button></div>
      </form>
    </Shell>
  );
}
