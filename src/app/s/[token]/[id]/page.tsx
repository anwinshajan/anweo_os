import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FileViewer from "@/components/FileViewer";
import { Logo } from "@/components/Logo";
import { descendantIds } from "@/lib/files";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared with you", robots: { index: false, follow: false } };

// A file inside a publicly shared folder (or the shared file itself), shown in the app without a login.
export default async function PublicView({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!/^[0-9a-f]{32}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = supabaseAdmin();
  const { data: root } = await admin.from("client_files").select("id,client_id,kind,status").eq("public_token", token).eq("status", "shared").maybeSingle();
  if (!root) notFound();
  const { data: all } = await admin.from("client_files").select("id,parent_id,kind,title,url,provider,notes,status").eq("client_id", root.client_id).eq("status", "shared");
  const allowed = new Set([root.id, ...descendantIds(all ?? [], root.id)]);
  const item = (all ?? []).find((r) => r.id === id);
  if (!item || !allowed.has(id) || item.kind !== "link") notFound();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-3"><Logo /><Link href={`/s/${token}`} className="btn-ghost !py-2 text-xs">← Back</Link></div>
      <FileViewer title={item.title} url={item.url ?? ""} provider={item.provider} notes={item.notes} />
    </main>
  );
}
