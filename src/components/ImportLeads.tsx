"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importProspectsAction } from "@/app/actions";
import { CSV_COLUMNS, CSV_TEMPLATE, csvToProspects, dupeKeys } from "@/lib/sales";
import { toast } from "@/components/Toaster";

// Paste or upload a sheet in the standard format, check it, then import. Rows already in the pipeline are skipped.
export default function ImportLeads({ existing }: { existing: { business_name: string; phone: string | null; city: string | null }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const seen = useMemo(() => new Set(existing.flatMap((e) => dupeKeys(e))), [existing]);
  const rows = useMemo(() => {
    const inFile = new Set<string>();
    return csvToProspects(text).slice(0, 500).map((r) => {
      const keys = dupeKeys({ phone: r.phone, business_name: r.business_name, city: r.city });
      const dupe = keys.some((k) => seen.has(k) || inFile.has(k));
      keys.forEach((k) => inFile.add(k));
      return { r, dupe };
    });
  }, [text, seen]);
  const fresh = rows.filter((x) => !x.dupe);
  const hasText = text.trim().length > 0;

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
    a.download = "anweo-leads-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function submit() {
    start(async () => {
      const res = await importProspectsAction(fresh.map((x) => x.r));
      if (res.error) { toast(res.error, "error"); return; }
      toast(`${res.added} added${res.skipped ? `, ${res.skipped} already existed` : ""}`);
      router.push("/growth");
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-edge bg-paper/60 p-4 text-sm">
        <p className="font-semibold">The format</p>
        <p className="mt-1 text-mute">One business per row. The first row must be these column names. Only <b>Business name</b> is required.</p>
        <p className="mt-2 break-words font-mono text-[11px] text-ink/70">{CSV_COLUMNS.join(" · ")}</p>
        <button type="button" onClick={download} className="btn-ghost mt-3">Download the template</button>
      </div>

      <label className="btn-ghost inline-flex cursor-pointer">
        Choose a .csv file
        <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
      </label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="…or paste rows copied from Google Sheets or Excel, including the header row" className="input font-mono text-xs" aria-label="Paste your sheet" />

      {hasText && rows.length === 0 && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">No rows found. Check that the first row has a “Business name” column.</p>}
      {rows.length > 0 && (
        <div>
          <p className="mb-2 text-sm"><b>{fresh.length}</b> new{rows.length - fresh.length > 0 && <> · <span className="text-mute">{rows.length - fresh.length} already in the pipeline (skipped)</span></>}</p>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {rows.slice(0, 100).map(({ r, dupe }, i) => (
              <div key={i} className={`row !py-2 ${dupe ? "opacity-50" : ""}`}>
                <span className="min-w-0"><span className="block truncate font-medium">{r.business_name}</span><span className="block truncate font-mono text-[11px] text-mute">{[r.phone, r.city, r.category].filter(Boolean).join(" · ") || "—"}</span></span>
                {dupe && <span className="pill bg-forest-soft text-forest">Exists</span>}
              </div>
            ))}
          </div>
          <button type="button" onClick={submit} disabled={busy || fresh.length === 0} className="btn-primary mt-3">Import {fresh.length} prospect{fresh.length === 1 ? "" : "s"}</button>
        </div>
      )}
    </div>
  );
}
