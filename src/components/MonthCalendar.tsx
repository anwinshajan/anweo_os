"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { reschedulePostAction } from "@/app/actions";
import { toast } from "@/components/Toaster";
import { stageOf, stageTone } from "@/lib/studio";

export type CalPost = { id: string; title: string; status: string; kind: string; platform: string; at: string | null; client?: string };

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

// A month of content. Drag a post to another day to reschedule it (team only); clients get a read-only view.
export default function MonthCalendar({ posts, month, hrefBase, canEdit, linkBase, showClient = false }: { posts: CalPost[]; month: string; hrefBase: string; canEdit: boolean; linkBase?: string; showClient?: boolean }) {
  const [local, setLocal] = useState<Record<string, string | null>>({});
  const [over, setOver] = useState<string | null>(null);
  const at = (p: CalPost) => (p.id in local ? local[p.id] : p.at);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = Math.ceil((lead + new Date(y, m, 0).getDate()) / 7) * 7;
  const cells = useMemo(() => Array.from({ length: days }, (_, i) => new Date(y, m - 1, 1 - lead + i)), [y, m, lead, days]);
  const todayKey = key(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, CalPost[]>();
    for (const p of posts) { const a = p.id in local ? local[p.id] : p.at; if (!a) continue; const k = key(new Date(a)); map.set(k, [...(map.get(k) ?? []), p]); }
    for (const list of map.values()) list.sort((a, b) => Date.parse(String(at(a))) - Date.parse(String(at(b))));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, local]);
  const unscheduled = posts.filter((p) => !at(p));
  const monthPosts = posts.filter((p) => { const a = at(p); if (!a) return false; const d = new Date(a); return d.getFullYear() === y && d.getMonth() === m - 1; }).sort((a, b) => Date.parse(String(at(a))) - Date.parse(String(at(b))));

  async function move(id: string, to: Date | null) {
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    const prev = at(p);
    let iso: string | null = null;
    if (to) {
      const base = prev ? new Date(prev) : null;
      iso = new Date(to.getFullYear(), to.getMonth(), to.getDate(), base ? base.getHours() : 10, base ? base.getMinutes() : 0).toISOString();
    }
    setLocal((s) => ({ ...s, [id]: iso }));
    const fd = new FormData(); fd.set("id", id); if (iso) fd.set("scheduled_at", iso); else fd.set("clear", "1");
    const r = await reschedulePostAction(fd);
    if (r?.error) { toast(r.error, "error"); setLocal((s) => ({ ...s, [id]: prev })); }
    else toast(iso ? "Rescheduled" : "Unscheduled");
  }

  const chip = (p: CalPost) => {
    const st = stageOf(p.status);
    const href = linkBase ? `${linkBase}${p.id}` : null;
    const inner = (
      <>
        <span className="block truncate font-medium">{p.title || "Untitled"}</span>
        <span className="block truncate font-mono text-[9px] uppercase opacity-70">{showClient && p.client ? `${p.client} · ` : ""}{p.kind}</span>
      </>
    );
    const cls = `block rounded-md px-1.5 py-1 text-left text-[11px] leading-tight ${stageTone[st.key]} ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`;
    const drag = canEdit ? { draggable: true, onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; } } : {};
    return href ? <Link key={p.id} href={href} className={cls} {...drag}>{inner}</Link> : <div key={p.id} className={cls} {...drag}>{inner}</div>;
  };

  const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const sep = hrefBase.includes("?") ? "&" : "?";
  const nav = (ym: string) => `${hrefBase}${sep}m=${ym}`;
  const thisMonth = key(new Date()).slice(0, 7);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <div className="flex items-center gap-1.5">
          <Link href={nav(shiftMonth(month, -1))} scroll={false} className="btn-ghost !px-3 !py-1.5" aria-label="Previous month">‹</Link>
          {month !== thisMonth && <Link href={nav(thisMonth)} scroll={false} className="btn-ghost !px-3 !py-1.5 text-xs">Today</Link>}
          <Link href={nav(shiftMonth(month, 1))} scroll={false} className="btn-ghost !px-3 !py-1.5" aria-label="Next month">›</Link>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-xl2 border border-edge bg-white shadow-card sm:block">
        <div className="grid grid-cols-7 border-b border-edge bg-paper/70">{WEEK.map((w) => <div key={w} className="px-2 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-mute">{w}</div>)}</div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const k = key(d), inMonth = d.getMonth() === m - 1, list = byDay.get(k) ?? [];
            return (
              <div key={k}
                onDragOver={canEdit ? (e) => { e.preventDefault(); setOver(k); } : undefined}
                onDragLeave={canEdit ? () => setOver((o) => (o === k ? null : o)) : undefined}
                onDrop={canEdit ? (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) void move(id, d); } : undefined}
                className={`min-h-[104px] border-b border-r border-edge p-1.5 transition-colors ${i % 7 === 6 ? "border-r-0" : ""} ${inMonth ? "bg-white" : "bg-paper/50"} ${over === k ? "bg-lime-soft" : ""}`}>
                <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${k === todayKey ? "bg-forest text-paper" : inMonth ? "text-ink" : "text-mute/60"}`}>{d.getDate()}</div>
                <div className="space-y-1">{list.slice(0, 3).map(chip)}{list.length > 3 && <p className="px-1 font-mono text-[10px] text-mute">+{list.length - 3} more</p>}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 sm:hidden">
        {monthPosts.length === 0 && <p className="rounded-xl border border-dashed border-edge p-5 text-center text-sm text-mute">Nothing scheduled this month.</p>}
        {monthPosts.map((p) => {
          const d = new Date(String(at(p)));
          return <div key={p.id} className="flex items-start gap-3"><div className="w-11 shrink-0 text-center"><p className="font-mono text-[10px] uppercase text-mute">{d.toLocaleDateString("en-GB", { weekday: "short" })}</p><p className="text-lg font-bold leading-none">{d.getDate()}</p></div><div className="min-w-0 flex-1">{chip(p)}</div></div>;
        })}
      </div>

      {(unscheduled.length > 0 || canEdit) && (
        <div className="mt-5"
          onDragOver={canEdit ? (e) => { e.preventDefault(); setOver("pool"); } : undefined}
          onDragLeave={canEdit ? () => setOver((o) => (o === "pool" ? null : o)) : undefined}
          onDrop={canEdit ? (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) void move(id, null); } : undefined}>
          <p className="tag mb-2">[ Not scheduled yet · {unscheduled.length} ]{canEdit ? " drag onto a day" : ""}</p>
          <div className={`grid gap-2 rounded-xl border border-dashed p-3 sm:grid-cols-3 lg:grid-cols-4 ${over === "pool" ? "border-forest bg-lime-soft" : "border-edge bg-paper/50"}`}>
            {unscheduled.length === 0 ? <p className="text-sm text-mute sm:col-span-4">Everything has a date. Drop a post here to unschedule it.</p> : unscheduled.map(chip)}
          </div>
        </div>
      )}
    </div>
  );
}
