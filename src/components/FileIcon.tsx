const TAG: Record<string, [string, string]> = {
  google_drive: ["GD", "bg-sky-100 text-sky-800"], dropbox: ["DB", "bg-blue-100 text-blue-800"], onedrive: ["OD", "bg-indigo-100 text-indigo-800"],
  figma: ["Fg", "bg-purple-100 text-purple-800"], canva: ["Cv", "bg-cyan-100 text-cyan-800"], notion: ["N", "bg-charcoal/10 text-charcoal"],
  youtube: ["YT", "bg-red-100 text-red-700"], vimeo: ["Vm", "bg-sky-100 text-sky-800"], wetransfer: ["WT", "bg-blue-100 text-blue-800"], link: ["↗", "bg-paper text-mute"],
};

// A small badge: a folder, or the logo-letters of where the link lives.
export default function FileIcon({ kind, provider }: { kind: string; provider: string }) {
  if (kind === "folder") return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-soft text-forest" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg></span>;
  const [t, c] = TAG[provider] ?? TAG.link;
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${c}`} aria-hidden="true">{t}</span>;
}
