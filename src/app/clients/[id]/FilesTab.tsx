import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import DeleteButton from "@/components/DeleteButton";
import FileIcon from "@/components/FileIcon";
import Form from "@/components/Form";
import { Empty } from "@/components/Shell";
import {
  addFileLinkAction, approveFileAction, createFolderAction, deleteFileAction, returnFileAction, submitFileAction, togglePublicLinkAction, updateFileAction,
} from "@/app/actions";
import { PROVIDERS, isMissingTable, pathTo } from "@/lib/files";
import { supabaseServer } from "@/lib/supabase-server";

const tone: Record<string, string> = { internal: "bg-charcoal/10 text-charcoal", pending: "bg-amber-100 text-amber-800", shared: "bg-lime-soft text-forest" };
const label: Record<string, string> = { internal: "team only", pending: "waiting for approval", shared: "shared with client" };

// Team workspace for a client's files and folders (links to Google Drive and so on). Nothing reaches the client until a manager approves it.
export default async function FilesTab({ id, folder, lead, origin }: { id: string; folder: string | null; lead: boolean; origin: string }) {
  const sb = await supabaseServer();
  const { data: rows, error } = await sb.from("client_files").select("id,parent_id,kind,title,url,provider,notes,status,public_token,created_at").eq("client_id", id).order("title");
  if (error) {
    return (
      <section className="card">
        <p className="tag mb-2">[ One-time setup needed ]</p>
        <p className="text-sm">{isMissingTable(error) ? "Shared files need a small database update before they can be used. Open Supabase → SQL Editor, paste the contents of supabase/migrations/0016_client_files.sql and press Run. Then refresh this page." : error.message}</p>
      </section>
    );
  }
  const all = rows ?? [];
  const here = folder && all.some((r) => r.id === folder && r.kind === "folder") ? folder : null;
  const crumbs = pathTo(all, here);
  const items = all.filter((r) => r.parent_id === here).sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === "folder" ? -1 : 1));
  const base = `/clients/${id}?tab=files`;

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Folders">
        <Link href={base} className={`rounded-lg px-2.5 py-1 font-medium ${here ? "text-forest hover:bg-forest-soft" : "bg-forest text-paper"}`}>All files</Link>
        {crumbs.map((c, i) => (<span key={c.id} className="flex items-center gap-1.5"><span className="text-mute">/</span><Link href={`${base}&f=${c.id}`} className={`rounded-lg px-2.5 py-1 font-medium ${i === crumbs.length - 1 ? "bg-forest text-paper" : "text-forest hover:bg-forest-soft"}`}>{c.title}</Link></span>))}
      </nav>

      <div className="grid gap-3 lg:grid-cols-2">
        <details className="card !p-0">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold">Add a link <span className="btn-lime !px-3 !py-1 text-xs">+ Link</span></summary>
          <Form action={addFileLinkAction} className="grid gap-3 border-t border-edge p-4">
            <input type="hidden" name="client_id" value={id} /><input type="hidden" name="parent_id" value={here ?? ""} />
            <div><label className="label">Link *</label><input name="url" required placeholder="Paste a Google Drive, Dropbox, Figma or Canva link" className="input" /></div>
            <div><label className="label">Name</label><input name="title" maxLength={140} placeholder="e.g. Final logo pack" className="input" /></div>
            <div><label className="label">Note (optional)</label><input name="notes" maxLength={500} className="input" /></div>
            <p className="text-xs text-mute">Remember to set the sharing on the Drive file itself, for example “anyone with the link can view”, so the client can open it.</p>
            <button className="btn-primary w-full sm:w-auto">Add link</button>
          </Form>
        </details>
        <details className="card !p-0">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold">New folder <span className="btn-ghost !px-3 !py-1 text-xs">+ Folder</span></summary>
          <Form action={createFolderAction} className="grid gap-3 border-t border-edge p-4">
            <input type="hidden" name="client_id" value={id} /><input type="hidden" name="parent_id" value={here ?? ""} />
            <div><label className="label">Folder name *</label><input name="title" required maxLength={140} placeholder="e.g. Website assets" className="input" /></div>
            <button className="btn-primary w-full sm:w-auto">Create folder</button>
          </Form>
        </details>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <Empty>{here ? "This folder is empty." : "No files yet. Add a link to a Google Drive folder or file to start."}</Empty>}
        {items.map((r) => {
          const publicUrl = r.public_token ? `${origin}/s/${r.public_token}` : null;
          return (
            <div key={r.id} className="rounded-xl border border-edge bg-white">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3.5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileIcon kind={r.kind} provider={r.provider} />
                  <div className="min-w-0">
                    {r.kind === "folder"
                      ? <Link href={`${base}&f=${r.id}`} className="block truncate font-semibold hover:text-forest hover:underline">{r.title}</Link>
                      : <a href={r.url ?? "#"} target="_blank" rel="noreferrer noopener" className="block truncate font-semibold hover:text-forest hover:underline">{r.title}</a>}
                    <p className="truncate font-mono text-[10.5px] uppercase text-mute">{r.kind === "folder" ? `${all.filter((x) => x.parent_id === r.id).length} items` : PROVIDERS[r.provider] ?? "Link"}{r.notes ? ` · ${r.notes}` : ""}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className={`pill ${tone[r.status]}`}>{label[r.status]}</span>
                  {r.status === "internal" && !lead && <Form action={submitFileAction} quiet><input type="hidden" name="id" value={r.id} /><button className="text-xs font-medium text-forest hover:underline">Ask to share</button></Form>}
                  {r.status === "internal" && lead && <Form action={approveFileAction}><input type="hidden" name="id" value={r.id} /><button className="text-xs font-semibold text-forest hover:underline">Share with client</button></Form>}
                  {r.status === "pending" && lead && <><Form action={approveFileAction}><input type="hidden" name="id" value={r.id} /><button className="text-xs font-semibold text-forest hover:underline">Approve</button></Form><Form action={returnFileAction} quiet><input type="hidden" name="id" value={r.id} /><button className="text-xs font-medium text-red-700 hover:underline">Not yet</button></Form></>}
                  {r.status === "shared" && lead && <Form action={returnFileAction} quiet><input type="hidden" name="id" value={r.id} /><button className="text-xs font-medium text-red-700 hover:underline">Stop sharing</button></Form>}
                  {r.kind === "folder" && r.status === "internal" && !lead && <span />}
                </div>
              </div>
              <details className="border-t border-edge bg-paper/50">
                <summary className="cursor-pointer list-none px-4 py-2 text-xs font-medium text-forest">Details</summary>
                <div className="space-y-3 px-4 pb-4">
                  <Form action={updateFileAction} className="grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="id" value={r.id} />
                    <div><label className="label">Name</label><input name="title" required defaultValue={r.title} className="input" /></div>
                    <div><label className="label">Note</label><input name="notes" defaultValue={r.notes ?? ""} className="input" /></div>
                    {r.kind === "link" && <div className="sm:col-span-2"><label className="label">Link</label><input name="url" required defaultValue={r.url ?? ""} className="input" /></div>}
                    {r.status === "shared" && !lead && <p className="text-xs text-amber-800 sm:col-span-2">Changing something the client can already see sends it back for approval.</p>}
                    <div className="sm:col-span-2"><button className="btn-primary">Save</button></div>
                  </Form>
                  {r.kind === "folder" && r.status === "internal" && (
                    <Form action={submitFileAction} quiet><input type="hidden" name="id" value={r.id} /><button className="btn-ghost !py-1.5 text-xs">{lead ? "Mark everything inside as ready" : "Ask to share this folder and everything in it"}</button></Form>
                  )}
                  {lead && r.status === "shared" && (
                    <div className="rounded-xl border border-edge bg-white p-3">
                      <p className="text-sm font-medium">Public link</p>
                      <p className="mb-2 text-xs text-mute">Anyone with the link can see this {r.kind === "folder" ? "folder's shared items" : "link"}, no login needed. Turn it off any time.</p>
                      {publicUrl ? (
                        <div className="flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-paper px-2.5 py-1.5 font-mono text-[11px]">{publicUrl}</code><CopyButton text={publicUrl} /><Form action={togglePublicLinkAction} quiet><input type="hidden" name="id" value={r.id} /><button className="text-xs font-medium text-red-700 hover:underline">Turn off</button></Form></div>
                      ) : <Form action={togglePublicLinkAction} quiet><input type="hidden" name="id" value={r.id} /><button className="btn-ghost !py-1.5 text-xs">Create a public link</button></Form>}
                    </div>
                  )}
                  {(lead || r.status !== "shared") && <Form action={deleteFileAction} className="border-t border-edge pt-2" quiet><input type="hidden" name="id" value={r.id} /><DeleteButton label={r.kind === "folder" ? "Delete folder and everything inside" : "Delete"} message={r.kind === "folder" ? "Delete this folder and everything inside it? The files themselves in Google Drive are not touched." : "Remove this link? The file itself in Google Drive is not touched."} /></Form>}
                </div>
              </details>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-mute">Files stay in your Google Drive (or wherever the link points), so they don't use any of this app's storage. For small files you'd rather store here, use the Documents tab.</p>
    </div>
  );
}
