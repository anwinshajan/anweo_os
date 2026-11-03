"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findLeadsAction, saveFoundLeadsAction } from "@/app/actions";
import { scoreLabel, whyThem, type Found } from "@/lib/sales";
import { toast } from "@/components/Toaster";

type R = Found & { exists: boolean };

export default function FindLeads() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<R[] | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, start] = useTransition();

  function search(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await findLeadsAction(q);
      setNeedsKey(!!r.needsKey);
      if (r.error && !r.needsKey) { toast(r.error, "error"); return; }
      const res = r.results ?? [];
      setRows(res);
      setSel(new Set(res.filter((x) => !x.exists && x.score >= 45).map((x) => x.place_id))); // pre-select the promising ones
    });
  }
  function save() {
    const items = (rows ?? []).filter((r) => sel.has(r.place_id) && !r.exists);
    if (!items.length) return;
    start(async () => {
      const r = await saveFoundLeadsAction(items);
      if (r.error) { toast(r.error, "error"); return; }
      toast(`${r.added ?? 0} prospect${r.added === 1 ? "" : "s"} added`);
      router.push("/growth");
    });
  }

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What and where, e.g. “barbers in Derby”" className="input" aria-label="Search" />
        <button className="btn-primary" disabled={busy || q.trim().length < 3}>{busy ? "…" : "Search"}</button>
      </form>
      <p className="mt-2 text-xs text-mute">Businesses with no website, few reviews or a low rating are marked hotter, because they need us most.</p>

      {needsKey && (
        <div className="card-green mt-4 !p-4 text-sm">
          <p className="font-semibold">Switch on Google lead search</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-paper/80">
            <li>In Google Cloud, create a project and enable “Places API (New)”.</li>
            <li>Create an API key and restrict it to that API.</li>
            <li>Add it in Vercel as <code className="rounded bg-white/10 px-1">GOOGLE_PLACES_API_KEY</code> and redeploy.</li>
          </ol>
          <p className="mt-2 text-paper/70">Until then you can import a list below or add prospects by hand.</p>
        </div>
      )}

      {rows && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="tag">[ {rows.length} found ]</p>
            <button className="btn-primary" onClick={save} disabled={busy || sel.size === 0}>Add {sel.size} to pipeline</button>
          </div>
          <div className="space-y-2">
            {rows.length === 0 && <p className="rounded-xl border border-dashed border-edge px-4 py-6 text-center text-sm text-mute">Nothing found. Try a different search.</p>}
            {rows.map((r) => (
              <label key={r.place_id} className={`row !items-start cursor-pointer ${r.exists ? "opacity-50" : ""}`}>
                <input type="checkbox" className="mt-1" disabled={r.exists} checked={sel.has(r.place_id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(r.place_id) ? n.delete(r.place_id) : n.add(r.place_id); return n; })} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.business_name}</span>
                  <span className="block truncate text-xs text-mute">{[r.category, r.address].filter(Boolean).join(" · ")}</span>
                  <span className="block text-xs text-mute">{[r.phone, r.website ? "has website" : "no website", r.rating ? `${r.rating}★ (${r.review_count ?? 0})` : null].filter(Boolean).join(" · ")}</span>
                  {whyThem(r).length > 0 && <span className="mt-0.5 block text-xs text-forest">{whyThem(r).join(", ")}</span>}
                </span>
                {r.exists ? <span className="pill bg-forest-soft text-forest">Added</span> : <span className={`pill ${r.score >= 70 ? "bg-red-50 text-red-700" : r.score >= 45 ? "bg-amber-50 text-amber-700" : "bg-forest-soft text-forest"}`}>{scoreLabel(r.score)}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
