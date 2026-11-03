import FileIcon from "@/components/FileIcon";
import { PROVIDERS, reachable } from "@/lib/files";

type Row = { id: string; parent_id: string | null; kind: string; title: string; url: string | null; provider: string; notes: string | null; status: string };

// What a client (or a public visitor) can open: only shared items whose folders are shared too. Folders open in place.
export default function SharedFiles({ rows, parent = null, depth = 0 }: { rows: Row[]; parent?: string | null; depth?: number }) {
  const list = (depth === 0 ? reachable(rows).filter((r) => r.parent_id === null || !rows.some((x) => x.id === r.parent_id)) : rows.filter((r) => r.parent_id === parent && r.status === "shared"))
    .sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === "folder" ? -1 : 1));
  if (list.length === 0) return depth === 0 ? <p className="rounded-xl border border-dashed border-edge p-5 text-center text-sm text-mute">Nothing has been shared yet.</p> : <p className="px-3 py-2 text-xs text-mute">This folder is empty.</p>;
  return (
    <div className={`space-y-2 ${depth > 0 ? "border-l-2 border-lime pl-3" : ""}`}>
      {list.map((r) => r.kind === "folder" ? (
        <details key={r.id} className="rounded-xl border border-edge bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3"><FileIcon kind="folder" provider="" /><span className="min-w-0"><span className="block truncate font-semibold">{r.title}</span>{r.notes && <span className="block truncate text-xs text-mute">{r.notes}</span>}</span></summary>
          <div className="border-t border-edge p-3"><SharedFiles rows={rows} parent={r.id} depth={depth + 1} /></div>
        </details>
      ) : (
        <a key={r.id} href={r.url ?? "#"} target="_blank" rel="noreferrer noopener" className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-white px-3.5 py-3 hover:border-forest/40">
          <span className="flex min-w-0 items-center gap-3"><FileIcon kind="link" provider={r.provider} /><span className="min-w-0"><span className="block truncate font-semibold">{r.title}</span><span className="block truncate text-xs text-mute">{PROVIDERS[r.provider] ?? "Link"}{r.notes ? ` · ${r.notes}` : ""}</span></span></span>
          <span className="shrink-0 text-xs font-medium text-forest">Open ↗</span>
        </a>
      ))}
    </div>
  );
}
