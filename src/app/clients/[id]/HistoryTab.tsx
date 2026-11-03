import DeleteButton from "@/components/DeleteButton";
import Form from "@/components/Form";
import LocalDateTime from "@/components/LocalDateTime";
import LocalTime from "@/components/LocalTime";
import { Empty } from "@/components/Shell";
import { addHistoryEntryAction, deleteHistoryEntryAction, updateHistoryEntryAction } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase-server";

// Admin only: the full timeline for this client. What is ticked "Show to the client" is exactly what the client sees.
export default async function HistoryTab({ id }: { id: string }) {
  const sb = await supabaseServer();
  const { data: rows } = await sb.from("activity_log").select("id,action,detail,client_visible,created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(300);
  const shown = (rows ?? []).filter((r) => r.client_visible).length;
  return (
    <div className="space-y-5">
      <section className="card">
        <p className="tag mb-1">[ Add an entry ]</p>
        <p className="mb-3 text-sm text-mute">Write something that happened, back-dated if you like. Tick the box and the client sees it on their dashboard.</p>
        <Form action={addHistoryEntryAction} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="client_id" value={id} />
          <div className="sm:col-span-4"><label className="label">What happened *</label><input name="detail" required maxLength={500} placeholder="e.g. Website went live on langfortacademy.online" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">When</label><LocalDateTime name="occurred_at" /></div>
          <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" name="visible" defaultChecked className="h-4 w-4 accent-forest" /> Show to the client</label>
          <div className="flex items-end"><button className="btn-primary w-full">Add entry</button></div>
        </Form>
      </section>

      <section>
        <p className="tag mb-2">[ Timeline · {rows?.length ?? 0} entries · {shown} visible to the client ]</p>
        <div className="space-y-2">
          {(rows ?? []).length === 0 && <Empty>No history yet.</Empty>}
          {(rows ?? []).map((r) => (
            <details key={r.id} className="rounded-xl border border-edge bg-white">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm">{r.detail}</span>
                  <span className="font-mono text-[10px] uppercase text-mute"><LocalTime iso={r.created_at} /> · {r.action.replace(/_/g, " ")}</span>
                </span>
                <span className={`pill shrink-0 ${r.client_visible ? "bg-lime-soft text-forest" : "bg-charcoal/10 text-charcoal"}`}>{r.client_visible ? "client sees" : "internal"}</span>
              </summary>
              <div className="border-t border-edge bg-paper/60 p-4">
                <Form action={updateHistoryEntryAction} className="grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="id" value={String(r.id)} />
                  <div className="sm:col-span-4"><label className="label">Wording</label><input name="detail" required maxLength={500} defaultValue={r.detail ?? ""} className="input" /></div>
                  <div className="sm:col-span-2"><label className="label">When</label><LocalDateTime name="occurred_at" defaultIso={r.created_at} /></div>
                  <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" name="visible" defaultChecked={r.client_visible} className="h-4 w-4 accent-forest" /> Show to the client</label>
                  <div className="flex items-end"><button className="btn-primary w-full">Save</button></div>
                </Form>
                <Form action={deleteHistoryEntryAction} className="mt-3 border-t border-edge pt-3" quiet>
                  <input type="hidden" name="id" value={String(r.id)} />
                  <DeleteButton label="Delete this entry" message="Delete this history entry? The client will no longer see it." />
                </Form>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
