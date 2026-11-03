import Link from "next/link";
import { redirect } from "next/navigation";
import ImportLeads from "@/components/ImportLeads";
import Shell, { PageHead } from "@/components/Shell";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Import() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !["admin", "manager", "marketing", "social_manager"].includes(me.role)) redirect("/");
  const sb = await supabaseServer();
  const { data } = await sb.from("prospects").select("business_name,phone,city").limit(5000);
  return (
    <Shell me={me}>
      <Link href="/growth" className="tag hover:text-forest">← Pipeline</Link>
      <div className="mt-3" />
      <PageHead tag="Anweo growth" title="Import leads" sub="Add many prospects at once from a sheet. We check for duplicates first." />
      <div className="card"><ImportLeads existing={(data ?? []) as any} /></div>
    </Shell>
  );
}
