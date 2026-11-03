import { redirect } from "next/navigation";
import ClockPanel from "@/components/ClockPanel";
import DeleteButton from "@/components/DeleteButton";
import Form from "@/components/Form";
import LocalTime from "@/components/LocalTime";
import Shell, { PageHead } from "@/components/Shell";
import { deleteTimeEntryAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isAdminRole, isLeadRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const hours = (ms: number) => { const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`; };

export default async function Clock() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const sb = await supabaseServer();
  const since = new Date(Date.now() - 35 * 86_400_000).toISOString();
  const { data: mine } = await sb.from("time_entries").select("id,clock_in,clock_out,note").eq("user_id", me.id).gte("clock_in", since).order("clock_in", { ascending: false });

  const lead = isLeadRole(me.role);
  const admin = isAdminRole(me.role);
  type Row = { id: string; name: string; open: string | null; ms: number; recent: { id: string; clock_in: string; clock_out: string | null; note: string | null }[] };
  let team: Row[] = [];
  if (lead) {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: all } = await sb.from("time_entries").select("id,user_id,clock_in,clock_out,note,profiles(full_name,email)").gte("clock_in", weekAgo).order("clock_in", { ascending: false });
    const by = new Map<string, Row>();
    const nowMs = Date.now();
    for (const e of (all ?? []) as any[]) {
      if (e.user_id === me.id) continue;
      const row: Row = by.get(e.user_id) ?? { id: e.user_id, name: e.profiles?.full_name || e.profiles?.email || "Team member", open: null, ms: 0, recent: [] };
      row.ms += (e.clock_out ? Date.parse(e.clock_out) : nowMs) - Date.parse(e.clock_in);
      if (!e.clock_out) row.open = e.clock_in;
      if (row.recent.length < 5) row.recent.push(e);
      by.set(e.user_id, row);
    }
    team = [...by.values()].sort((a, b) => Number(!!b.open) - Number(!!a.open) || b.ms - a.ms);
  }

  return (
    <Shell me={me}>
      <PageHead tag="Time" title="Clock in / out" sub="Track your working hours. Your manager can see them." />
      <div className="max-w-2xl"><ClockPanel entries={mine ?? []} /></div>

      {lead && (
        <section className="mt-10">
          <p className="tag mb-3">[ Team · last 7 days ]</p>
          <div className="space-y-3">
            {team.length === 0 && <p className="rounded-xl border border-dashed border-edge p-5 text-center text-sm text-mute">Nobody else has clocked in this week.</p>}
            {team.map((t) => (
              <details key={t.id} className="card !p-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.open ? "bg-lime-deep" : "bg-edge"}`} />
                    <span className="truncate font-medium">{t.name}</span>
                    {t.open && <span className="pill bg-lime-soft text-forest"><span>on the clock · since <LocalTime iso={t.open} mode="time" /></span></span>}
                  </span>
                  <span className="font-mono font-semibold">{hours(t.ms)}</span>
                </summary>
                <div className="space-y-1.5 border-t border-edge p-3">
                  {t.recent.map((e) => (
                    <div key={e.id} className="row !bg-white">
                      <span className="min-w-0 truncate font-mono text-[11px] text-mute"><LocalTime iso={e.clock_in} /> → {e.clock_out ? <LocalTime iso={e.clock_out} mode="time" /> : "now"}{e.note ? ` · ${e.note}` : ""}</span>
                      {admin && <Form action={deleteTimeEntryAction} quiet><input type="hidden" name="id" value={e.id} /><DeleteButton message="Delete this time entry?" /></Form>}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
