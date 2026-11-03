import FileIcon from "@/components/FileIcon";
import { PROVIDERS, embedUrl } from "@/lib/files";

// Shows a linked file inside the app when its site allows it, otherwise a clear card with a button to open it.
export default function FileViewer({ title, url, provider, notes }: { title: string; url: string; provider: string; notes?: string | null }) {
  const src = embedUrl(url);
  const name = PROVIDERS[provider] ?? "the original site";
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(src ?? "") || /youtube|vimeo/.test(src ?? "");
  return (
    <div className="overflow-hidden rounded-xl2 border border-edge bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <div className="flex min-w-0 items-center gap-3"><FileIcon kind="link" provider={provider} /><div className="min-w-0"><p className="truncate font-semibold">{title}</p><p className="truncate font-mono text-[10.5px] uppercase text-mute">{name}{notes ? ` · ${notes}` : ""}</p></div></div>
        <a href={url} target="_blank" rel="noreferrer noopener" className="btn-ghost !py-2 text-xs">Open in {name} ↗</a>
      </div>
      {src ? (
        <>
          <iframe
            src={src} title={title} loading="lazy" allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
            className={`block w-full bg-paper ${isVideo ? "aspect-video" : "h-[78vh] min-h-[420px]"}`}
          />
          <p className="border-t border-edge px-4 py-2.5 text-xs text-mute">If you see a “request access” message, the file isn't shared with you in {name} yet. Ask the team to set it to “anyone with the link can view”.</p>
        </>
      ) : (
        <div className="px-6 py-12 text-center">
          <p className="font-semibold">This one can't be shown inside the app</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-mute">{name} doesn't allow its files to be shown on other sites. You can still open it in a new tab.</p>
          <a href={url} target="_blank" rel="noreferrer noopener" className="btn-primary mt-5">Open in {name} ↗</a>
        </div>
      )}
    </div>
  );
}
