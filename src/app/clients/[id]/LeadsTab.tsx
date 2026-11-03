import LeadsPanel from "@/components/LeadsPanel";
import { supabaseServer } from "@/lib/supabase-server";

export default async function LeadsTab({ id, currency }: { id: string; currency: string }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("leads").select("id,name,phone,email,source,status,value,notes,created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(300);
  return <LeadsPanel leads={data ?? []} clientId={id} currency={currency} />;
}
