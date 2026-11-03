import Link from "next/link";
import { redirect } from "next/navigation";
import Form from "@/components/Form";
import FindLeads from "@/components/FindLeads";
import Shell, { PageHead } from "@/components/Shell";
import { importProspectsCsvAction } from "@/app/actions";
import { getMe } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Find() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !["admin", "manager", "marketing", "social_manager"].includes(me.role)) redirect("/");
  return (
    <Shell me={me}>
      <Link href="/growth" className="tag hover:text-forest">← Pipeline</Link>
      <div className="mt-3" />
      <PageHead tag="Anweo growth" title="Find leads" sub="Search public business listings, then add the good ones to your pipeline." />
      <div className="card"><FindLeads /></div>
      <details className="card mt-5">
        <summary className="cursor-pointer font-semibold">Import a list (CSV or pasted from a sheet)</summary>
        <p className="mt-2 text-sm text-mute">First row is the header. Needs a “Business name” column. Phone, email, website, instagram, city, category and notes are picked up if present. Up to 500 rows.</p>
        <Form action={importProspectsCsvAction} className="mt-3 space-y-2">
          <textarea name="csv" rows={8} required placeholder={"Business name,Phone,City\nJoe's Barbers,07700 900123,Derby"} className="input font-mono text-xs" />
          <button className="btn-primary">Import</button>
        </Form>
      </details>
    </Shell>
  );
}
