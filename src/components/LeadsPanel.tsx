import DeleteButton from "@/components/DeleteButton";
import Form from "@/components/Form";
import LocalTime from "@/components/LocalTime";
import { Empty, money } from "@/components/Shell";
import { addLeadAction, deleteLeadAction, updateLeadAction } from "@/app/actions";

export type Lead = { id: string; name: string; phone: string | null; email: string | null; source: string; status: string; value: number | string | null; notes: string | null; created_at: string };
const STAGES = ["new", "contacted", "qualified", "won", "lost"] as const;
const tone: Record<string, string> = { new: "bg-amber-100 text-amber-800", contacted: "bg-sky-100 text-sky-800", qualified: "bg-forest-soft text-forest", won: "bg-lime-soft text-forest", lost: "bg-charcoal/10 text-charcoal" };

// The lead pipeline. Used by the team (per client) and by the client on their own dashboard.
export default function LeadsPanel({ leads, clientId, currency, isClient = false }: { leads: Lead[]; clientId?: string; currency: string; isClient?: boolean }) {
  const count = (s: string) => leads.filter((l) => l.status === s).length;
  const wonValue = leads.filter((l) => l.status === "won").reduce((a, l) => a + Number(l.value ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STAGES.map((s) => <div key={s} className="card !p-3 text-center"><p className="tag !text-[9px]">{s}</p><p className="mt-0.5 text-xl font-bold">{count(s)}</p></div>)}
        <div className="card-green !p-3 text-center"><p className="tag !text-[9px] !text-lime">won value</p><p className="mt-0.5 text-sm font-bold leading-7">{wonValue > 0 ? money(wonValue, currency) : "–"}</p></div>
      </div>

      <details className="card !p-0">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold">Add a lead <span className="btn-lime !px-3 !py-1 text-xs">+ Add</span></summary>
        <Form action={addLeadAction} className="grid gap-3 border-t border-edge p-4 sm:grid-cols-4">
          {clientId && <input type="hidden" name="client_id" value={clientId} />}
          <div className="sm:col-span-2"><label className="label">Name *</label><input name="name" required maxLength={120} className="input" /></div>
          <div><label className="label">Phone / WhatsApp</label><input name="phone" className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
          <div><label className="label">Source</label><select name="source" className="input"><option value="manual">Added by hand</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="website">Website</option><option value="call">Phone call</option><option value="referral">Referral</option></select></div>
          <div><label className="label">Possible value</label><input name="value" type="number" min="0" step="0.01" placeholder={currency} className="input" /></div>
          <div className="sm:col-span-4"><label className="label">Notes</label><input name="notes" className="input" /></div>
          <div className="sm:col-span-4"><button className="btn-primary">Save lead</button></div>
        </Form>
      </details>

      <div className="space-y-2">
        {leads.length === 0 && <Empty>No leads yet. {isClient ? "Add one, or ask the team to connect your website form." : "Add one by hand or connect the client's website form (Marketing tab)."}</Empty>}
        {leads.map((l) => (
          <details key={l.id} className="rounded-xl border border-edge bg-white">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="min-w-0"><span className="block truncate font-medium">{l.name}</span><span className="font-mono text-[10px] uppercase text-mute">{l.source} · <LocalTime iso={l.created_at} mode="date" />{l.phone ? ` · ${l.phone}` : ""}</span></span>
              <span className="flex items-center gap-2">{l.value ? <span className="text-sm font-semibold">{money(l.value, currency)}</span> : null}<span className={`pill ${tone[l.status]}`}>{l.status}</span></span>
            </summary>
            <div className="border-t border-edge bg-paper/60 p-4">
              <Form action={updateLeadAction} className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="id" value={l.id} />
                <div className="sm:col-span-2"><label className="label">Name</label><input name="name" required defaultValue={l.name} className="input" /></div>
                <div><label className="label">Phone</label><input name="phone" defaultValue={l.phone ?? ""} className="input" /></div>
                <div><label className="label">Email</label><input name="email" defaultValue={l.email ?? ""} className="input" /></div>
                <div><label className="label">Status</label><select name="status" defaultValue={l.status} className="input">{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
                <div><label className="label">Value</label><input name="value" type="number" min="0" step="0.01" defaultValue={l.value ?? ""} className="input" /></div>
                <div className="sm:col-span-2"><label className="label">Notes</label><input name="notes" defaultValue={l.notes ?? ""} className="input" /></div>
                <div className="sm:col-span-4 flex gap-2"><button className="btn-primary">Save</button></div>
              </Form>
              <Form action={deleteLeadAction} className="mt-3 border-t border-edge pt-3" quiet><input type="hidden" name="id" value={l.id} /><DeleteButton label="Delete lead" message="Delete this lead?" /></Form>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
