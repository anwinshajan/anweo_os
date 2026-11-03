import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import FileViewer from "@/components/FileViewer";
import SharedFiles from "@/components/SharedFiles";
import Shell from "@/components/Shell";
import { descendantIds, pathTo } from "@/lib/files";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Opens a shared file inside the app. The database decides who may see it (the team: everything for their clients; clients: only shared items).
export default async function ViewFile({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseServer();
  const { data: item } = await sb.from("client_files").select("id,client_id,parent_id,kind,title,url,provider,notes,status").eq("id", id).single();
  if (!item) notFound();
  const isClient = me.role === "client";
  const backHref = isClient ? "/" : `/clients/${item.client_id}?tab=files${item.parent_id ? `&f=${item.parent_id}` : ""}`;

  if (item.kind === "folder") {
    if (!isClient) redirect(`/clients/${item.client_id}?tab=files&f=${item.id}`);
    const { data: all } = await sb.from("client_files").select("id,parent_id,kind,title,url,provider,notes,status").eq("client_id", item.client_id);
    const ids = new Set(descendantIds(all ?? [], item.id));
    const rows = (all ?? []).filter((r) => ids.has(r.id)).map((r) => (r.parent_id === item.id ? { ...r, parent_id: null } : r));
    return (
      <Shell me={me}>
        <Link href={backHref} className="tag hover:text-forest">← Back</Link>
        <h1 className="mb-4 mt-3 text-2xl font-bold tracking-tight">{item.title}</h1>
        <SharedFiles rows={rows} viewBase="/view/" />
      </Shell>
    );
  }

  const { data: chain } = await sb.from("client_files").select("id,parent_id,title").eq("client_id", item.client_id);
  const crumbs = pathTo(chain ?? [], item.parent_id);
  return (
    <Shell me={me}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
        <Link href={backHref} className="tag hover:text-forest">← Back to files</Link>
        {crumbs.length > 0 && <span className="text-mute">·</span>}
        {crumbs.map((c) => <span key={c.id} className="font-mono text-[11px] uppercase text-mute">{c.title} /</span>)}
      </div>
      <FileViewer title={item.title} url={item.url ?? ""} provider={item.provider} notes={item.notes} />
    </Shell>
  );
}
