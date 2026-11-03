"use client";
import { useEffect, useMemo, useState } from "react";
import Form from "@/components/Form";
import { clockInAction, clockOutAction } from "@/app/actions";

type Entry = { id: string; clock_in: string; clock_out: string | null; note: string | null };

const fmt = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Big clock in/out button with a live timer, today's and this week's totals, and recent shifts. Times are in the viewer's own time zone.
export default function ClockPanel({ entries }: { entries: Entry[] }) {
  const [now, setNow] = useState<number | null>(null);
  const [finish, setFinish] = useState("");
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const open = entries.find((e) => !e.clock_out) ?? null;
  const t = now ?? 0;
  const msOf = (e: Entry) => (e.clock_out ? Date.parse(e.clock_out) : t) - Date.parse(e.clock_in);

  const { today, week } = useMemo(() => {
    if (!now) return { today: 0, week: 0 };
    const d = new Date(now);
    const dayStart = startOfDay(d);
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    const weekStart = dayStart - dow * 86_400_000;
    let a = 0, b = 0;
    for (const e of entries) {
      const s = Date.parse(e.clock_in), end = e.clock_out ? Date.parse(e.clock_out) : now;
      b += Math.max(0, end - Math.max(s, weekStart));
      a += Math.max(0, end - Math.max(s, dayStart));
    }
    return { today: a, week: b };
  }, [entries, now]);

  const forgot = open && now ? now - Date.parse(open.clock_in) > 14 * 3600_000 : false;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <section className={`rounded-xl2 p-6 shadow-lift ${open ? "bg-forest text-paper" : "bg-white text-ink border border-edge"}`}>
        <p className={`tag ${open ? "!text-lime" : ""}`}>{open ? "You're on the clock" : "You're clocked out"}</p>
        <p className="mt-2 font-mono text-5xl font-bold tracking-tight tabular-nums" suppressHydrationWarning>{open && now ? fmt(msOf(open)).replace("h ", ":").replace("m", "") : "0:00"}</p>
        {open && <p className="mt-1 text-sm text-paper/70" suppressHydrationWarning>Since {hm(open.clock_in)} on {day(open.clock_in)}</p>}

        {!open ? (
          <Form action={clockInAction} className="mt-5" quiet><button className="btn-lime w-full !py-4 text-base sm:w-auto sm:!px-10">Clock in</button></Form>
        ) : (
          <Form action={clockOutAction} className="mt-5 space-y-3" quiet>
            {forgot && (
              <div className="rounded-xl bg-white/10 p-3 text-sm">
                <p className="font-semibold text-lime">Did you forget to clock out?</p>
                <label className="label mt-2 !text-paper/70">I actually finished at</label>
                <input type="datetime-local" value={finish ? toLocalInput(new Date(finish)) : ""} max={toLocalInput(new Date())} min={toLocalInput(new Date(Date.parse(open.clock_in) + 60000))} onChange={(e) => setFinish(e.target.value ? new Date(e.target.value).toISOString() : "")} className="input !bg-white !text-ink" />
                <input type="hidden" name="ended_at" value={finish} />
              </div>
            )}
            <input name="note" placeholder="What did you work on? (optional)" className="input !bg-white !text-ink" />
            <button className="btn w-full bg-white !py-4 text-base text-forest sm:w-auto sm:!px-10">Clock out</button>
          </Form>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="card !p-4"><p className="tag">Today</p><p className="mt-1 font-mono text-2xl font-bold" suppressHydrationWarning>{now ? fmt(today) : "–"}</p></div>
        <div className="card !p-4"><p className="tag">This week</p><p className="mt-1 font-mono text-2xl font-bold" suppressHydrationWarning>{now ? fmt(week) : "–"}</p></div>
      </div>

      <section>
        <p className="tag mb-2">[ Recent shifts ]</p>
        <div className="space-y-2">
          {entries.length === 0 && <p className="rounded-xl border border-dashed border-edge p-5 text-center text-sm text-mute">No shifts yet. Clock in to start.</p>}
          {entries.filter((e) => e.clock_out).slice(0, 20).map((e) => (
            <div key={e.id} className="row">
              <div className="min-w-0"><p className="font-medium" suppressHydrationWarning>{day(e.clock_in)}</p><p className="font-mono text-[11px] text-mute" suppressHydrationWarning>{hm(e.clock_in)} – {hm(e.clock_out!)}{e.note ? ` · ${e.note}` : ""}</p></div>
              <span className="font-mono font-semibold" suppressHydrationWarning>{now ? fmt(msOf(e)) : ""}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
