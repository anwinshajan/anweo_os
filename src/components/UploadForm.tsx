"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { prepareUploadAction, registerDocumentAction } from "@/app/actions";

const MAX_MB = 25;

export default function UploadForm({ clientId, canContract, projects }: { clientId: string; canContract: boolean; projects: { id: string; title: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setOk("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file") as File | null;
    if (!file || !file.size) { setError("Choose a file first."); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`That file is over ${MAX_MB} MB.`); return; }
    setBusy(true);
    try {
      const prepFd = new FormData();
      prepFd.set("client_id", clientId);
      prepFd.set("kind", String(data.get("kind")));
      prepFd.set("file_name", file.name);
      const prep = await prepareUploadAction(prepFd);
      if (prep.error || !prep.path || !prep.token) { setError(prep.error || "Upload could not start."); return; }

      const up = await supabaseBrowser().storage.from("documents").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined });
      if (up.error) { setError("Upload failed: " + up.error.message); return; }

      const reg = new FormData();
      reg.set("client_id", clientId);
      reg.set("path", prep.path);
      reg.set("kind", String(data.get("kind")));
      reg.set("title", String(data.get("title") || ""));
      reg.set("project_id", String(data.get("project_id") || ""));
      reg.set("file_name", file.name);
      reg.set("mime_type", file.type);
      reg.set("size", String(file.size));
      if (data.get("visible") === "on") reg.set("visible", "on");
      const r = await registerDocumentAction(reg);
      if (r.error) { setError(r.error); return; }
      form.reset();
      setOk("Uploaded.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 border-t border-edge pt-5 sm:grid-cols-4">
      <div className="sm:col-span-2"><label className="label">File (max {MAX_MB} MB)</label>
        <input name="file" type="file" required className="input !py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-forest-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-forest" /></div>
      <div><label className="label">Type</label>
        <select name="kind" className="input" defaultValue="other">
          {canContract && <option value="contract">Contract</option>}
          <option value="proposal">Proposal</option><option value="brief">Brief</option>
          <option value="asset">Asset (logo, images, video)</option><option value="report">Report</option><option value="other">Other</option>
        </select></div>
      <div><label className="label">Project (optional)</label>
        <select name="project_id" className="input"><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">Title</label><input name="title" placeholder="e.g. Service agreement 2026" className="input" /></div>
      <label className="flex items-end gap-2 pb-2.5 text-sm sm:col-span-2"><input type="checkbox" name="visible" className="h-4 w-4 accent-forest" /> Share with the client now</label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 sm:col-span-4">{error}</p>}
      {ok && <p className="rounded-xl bg-lime-soft px-3.5 py-2.5 text-sm text-forest sm:col-span-4">{ok}</p>}
      <div className="sm:col-span-4"><button className="btn-primary" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button></div>
    </form>
  );
}
