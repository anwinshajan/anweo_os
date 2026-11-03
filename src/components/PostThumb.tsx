// A post's cover: its first image or video, or a plain placeholder.
export default function PostThumb({ media, kind, className = "" }: { media?: { id: string; mime_type: string | null }[]; kind: string; className?: string }) {
  const m = media?.[0];
  const isVideo = m?.mime_type?.startsWith("video/");
  return (
    <div className={`relative overflow-hidden bg-forest-soft ${className}`}>
      {m ? (
        isVideo
          ? <video src={`/api/media/${m.id}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={`/api/media/${m.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-widest text-forest/60">{kind}</div>
      )}
      {media && media.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 font-mono text-[10px] text-paper">+{media.length - 1}</span>}
      {isVideo && <span className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-2 py-0.5 font-mono text-[10px] text-paper">▶ video</span>}
    </div>
  );
}
