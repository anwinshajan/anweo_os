// Pure helpers for shared files (links to Google Drive, Dropbox and so on). Safe to test without a database.

export const PROVIDERS: Record<string, string> = {
  google_drive: "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive", figma: "Figma", canva: "Canva", notion: "Notion",
  youtube: "YouTube", vimeo: "Vimeo", wetransfer: "WeTransfer", link: "Link",
};

export function detectProvider(url: string): string {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return "link"; }
  const is = (...d: string[]) => d.some((x) => host === x || host.endsWith("." + x));
  if (is("drive.google.com", "docs.google.com", "sheets.google.com", "slides.google.com")) return "google_drive";
  if (is("dropbox.com", "dropboxusercontent.com")) return "dropbox";
  if (is("onedrive.live.com", "1drv.ms", "sharepoint.com")) return "onedrive";
  if (is("figma.com")) return "figma";
  if (is("canva.com")) return "canva";
  if (is("notion.so", "notion.site")) return "notion";
  if (is("youtube.com", "youtu.be")) return "youtube";
  if (is("vimeo.com")) return "vimeo";
  if (is("wetransfer.com", "we.tl")) return "wetransfer";
  return "link";
}

// Accepts "drive.google.com/..." or a full address; only https links are kept. Returns null when it can't be used.
export function normalizeUrl(input: string): string | null {
  let v = (input ?? "").trim();
  if (!v || /\s/.test(v)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) return null;   // javascript:, data:, file: ...
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/^http:\/\//i, "https://");
  try { const u = new URL(v); if (!u.hostname.includes(".")) return null; return u.toString().slice(0, 1000); } catch { return null; }
}

export type FileRow = { id: string; parent_id: string | null; kind: string; status: string };

// Every folder and file inside this folder, at any depth.
export function descendantIds(rows: { id: string; parent_id: string | null }[], folderId: string): string[] {
  const out: string[] = [];
  const queue = [folderId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of rows) if (r.parent_id === cur && !out.includes(r.id)) { out.push(r.id); queue.push(r.id); }
  }
  return out;
}

// The path from the top down to this folder (for the "Files / Website / Logos" breadcrumb).
export function pathTo<T extends { id: string; parent_id: string | null }>(rows: T[], id: string | null): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path: T[] = [];
  let cur = id ? byId.get(id) : undefined;
  while (cur && path.length < 20) { path.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
  return path;
}

// What a client can open: rows whose whole chain of folders above them is also shared.
export function reachable<T extends { id: string; parent_id: string | null; status: string }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ok = (r: T, depth = 0): boolean => r.status === "shared" && depth < 20 && (!r.parent_id || (byId.has(r.parent_id) && ok(byId.get(r.parent_id)!, depth + 1)));
  return rows.filter((r) => ok(r));
}

export const newToken = (): string => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
export const isMissingTable = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(e.message ?? ""));

// The address to show inside the app (an iframe) for a link, or null when that site doesn't allow being shown inside another page.
export function embedUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase(), path = u.pathname;
  const is = (...d: string[]) => d.some((x) => host === x || host.endsWith("." + x));
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const media = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm"];

  if (host === "drive.google.com") {
    const folder = path.match(/\/folders\/([\w-]+)/);
    if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder[1]}#list`;
    const id = path.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get("id");
    return id && /^[\w-]+$/.test(id) ? `https://drive.google.com/file/d/${id}/preview` : null;
  }
  if (host === "docs.google.com") {
    if (path.startsWith("/forms/")) { const f = new URL(url); f.searchParams.set("embedded", "true"); return f.toString(); }
    const m = path.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
    return m ? `https://docs.google.com/${m[1]}/d/${m[2]}/preview` : null;
  }
  if (host === "youtu.be" || is("youtube.com")) {
    const id = host === "youtu.be" ? path.slice(1) : u.searchParams.get("v") ?? path.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1] ?? "";
    return /^[\w-]{6,15}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (is("vimeo.com")) { const id = path.match(/^\/(\d+)/)?.[1]; return id ? `https://player.vimeo.com/video/${id}` : null; }
  if (is("figma.com") && /^\/(file|design|proto|board|slides)\//.test(path)) return `https://www.figma.com/embed?embed_host=anweo&url=${encodeURIComponent(url)}`;
  if (is("canva.com") && path.includes("/design/")) { const c = new URL(url); c.searchParams.delete("embed"); return `${c.toString()}${c.search ? "&" : "?"}embed`; }
  if (is("dropbox.com") && media.includes(ext)) { const d = new URL(url); d.searchParams.delete("dl"); d.searchParams.set("raw", "1"); return d.toString(); }
  if (media.includes(ext)) return url;
  return null;
}
