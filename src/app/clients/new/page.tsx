import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { PageHead } from "@/components/Shell";
import { createClientAction } from "@/app/actions";
import CountryCurrency from "@/components/CountryCurrency";
import { getMe } from "@/lib/supabase-server";
import { isLeadRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function NewClient() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !isLeadRole(me.role)) redirect("/");

  return (
    <Shell me={me}>
      <Link href="/" className="tag hover:text-forest">← All clients</Link>
      <div className="mt-3" />
      <PageHead tag="New" title="Add a client" sub="Start with the basics. You can pick their services, add projects and create their login next." />
      <form action={createClientAction} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="business_name">Business name *</label><input id="business_name" name="business_name" required autoFocus className="input" /></div>
        <div><label className="label" htmlFor="contact_name">Contact person</label><input id="contact_name" name="contact_name" className="input" /></div>
        <div><label className="label" htmlFor="phone">Phone / WhatsApp</label><input id="phone" name="phone" inputMode="tel" className="input" /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" /></div>
        <CountryCurrency defaultCountry="India" />
        <div className="sm:col-span-2"><label className="label" htmlFor="notes">Internal notes (clients never see these)</label><textarea id="notes" name="notes" rows={3} className="input" /></div>
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary">Create client</button>
          <Link href="/" className="btn-ghost">Cancel</Link>
        </div>
      </form>
    </Shell>
  );
}
