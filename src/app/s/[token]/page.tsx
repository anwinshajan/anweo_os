import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import FileIcon from "@/components/FileIcon";
import { Logo } from "@/components/Logo";
import SharedFiles from "@/components/SharedFiles";
import { PROVIDERS, descendantIds } from "@/lib/files";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared with you", robots: { index: false, follow: false } };

// A public page for one shared folder or file: anyone with the long link can open it, nothing else is exposed.
export default async function PublicShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const admin = supabaseAdmin();
  const { data: item } = await admin.from("client_files").select("id,client_id,parent_id,kind,title,url,provider,notes,status").eq("public_token", token).eq("status", "shared").maybeSingle();
  if (!item) notFound();

  let rows: { id: string; parent_id: string | null; kind: string; title: string; url: string | null; provider: string; notes: string | null; status: string }[] = [];
  if (item.kind === "folder") {
    const { data: all } = await admin.from("client_files").select("id,parent_id,kind,title,url,provider,notes,status").eq("client_id", item.client_id).eq("status", "shared");
    const ids = new Set(descendantIds(all ?? [], item.id));
    rows = (all ?? []).filter((r) => ids.has(r.id)).map((r) => (r.parent_id === item.id ? { ...r, parent_id: null } : r));
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <div className="mb-8 flex justify-center"><Logo /></div>
      <div className="card">
        <p className="tag mb-1">[ Shared with you ]</p>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">{item.title}</h1>
        {item.notes && <p className="mt-1 text-sm text-mute">{item.notes}</p>}
        <div className="mt-5">
          {item.kind === "folder" ? <SharedFiles rows={rows} viewBase={`/s/${token}/`} /> : (
            <Link href={`/s/${token}/${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-paper/60 px-4 py-4 hover:border-forest/40">
              <span className="flex min-w-0 items-center gap-3"><FileIcon kind="link" provider={item.provider} /><span className="min-w-0"><span className="block truncate font-semibold">{item.title}</span><span className="text-xs text-mute">{PROVIDERS[item.provider] ?? "Link"}</span></span></span>
              <span className="btn-primary !py-2 text-sm">Open →</span>
            </Link>
          )}
        </div>
      </div>
      <p className="mt-6 text-center font-mono text-[10.5px] text-mute">Shared securely with Anweo · Everything digital.</p>
    </main>
  );
}
