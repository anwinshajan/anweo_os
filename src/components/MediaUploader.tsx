"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { preparePostMediaAction, registerPostMediaAction } from "@/app/actions";
import { toast } from "@/components/Toaster";

const MAX_MB = 25;

// Upload photos and videos straight to private storage, one after another, with progress.
export default function MediaUploader({ postId }: { postId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    setBusy(true);
    let done = 0;
    for (const file of files) {
      setStatus(`Uploading ${done + 1} of ${files.length}: ${file.name}`);
      if (file.size > MAX_MB * 1024 * 1024) { toast(`${file.name} is over ${MAX_MB} MB. Compress it or share a link in the notes.`, "error"); continue; }
      try {
        const prep = new FormData(); prep.set("post_id", postId); prep.set("file_name", file.name);
        const p = await preparePostMediaAction(prep);
        if (p.error || !p.path || !p.token) { toast(p.error || "Upload could not start", "error"); continue; }
        const up = await supabaseBrowser().storage.from("documents").uploadToSignedUrl(p.path, p.token, file, { contentType: file.type || undefined });
        if (up.error) { toast(`Upload failed: ${up.error.message}`, "error"); continue; }
        const reg = new FormData();
        reg.set("post_id", postId); reg.set("path", p.path); reg.set("file_name", file.name); reg.set("mime_type", file.type); reg.set("size", String(file.size));
        const r = await registerPostMediaAction(reg);
        if (r.error) { toast(r.error, "error"); continue; }
        done++;
      } catch (err) { toast(err instanceof Error ? err.message : "Upload failed", "error"); }
    }
    setBusy(false); setStatus("");
    if (input.current) input.current.value = "";
    if (done) { toast(done === 1 ? "File added" : `${done} files added`); router.refresh(); }
  }

  return (
    <div>
      <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-edge bg-paper/60 px-4 py-6 text-center hover:border-forest/50 ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <span className="text-sm font-semibold text-forest">{busy ? status : "+ Upload photos or videos"}</span>
        <span className="text-xs text-mute">PNG, JPG, WebP, GIF, MP4 or MOV · up to {MAX_MB} MB each</span>
        <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime" onChange={onPick} className="sr-only" />
      </label>
    </div>
  );
}
