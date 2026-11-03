import Form from "@/components/Form";
import { money } from "@/components/Shell";
import { requestServiceAction } from "@/app/actions";

type Svc = { id: string; name: string; description: string | null };
type Pkg = { id: string; service_id: string; name: string; price_monthly: number; currency: string; prices: Record<string, number> | null };

// "Add more" for clients: pick a service (and a package) and the team gets a ticket to follow up.
export default function RequestServices({ services, packages, activeIds, currency }: { services: Svc[]; packages: Pkg[]; activeIds: string[]; currency: string }) {
  if (services.length === 0) return null;
  return (
    <section className="card">
      <p className="tag mb-1">[ Add more to your plan ]</p>
      <p className="mb-3 text-sm text-mute">Want something else? Pick it and tell us what you need. The team replies in your Support tickets.</p>
      <div className="space-y-2">
        {services.map((s) => {
          const pk = packages.filter((p) => p.service_id === s.id);
          const mine = activeIds.includes(s.id);
          return (
            <details key={s.id} className="rounded-xl border border-edge bg-paper/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0"><span className="block font-medium">{s.name}</span>{s.description && <span className="block truncate text-xs text-mute">{s.description}</span>}</span>
                <span className={`pill shrink-0 ${mine ? "bg-lime-soft text-forest" : "bg-white text-forest"}`}>{mine ? "you have this" : "request"}</span>
              </summary>
              <Form action={requestServiceAction} className="grid gap-3 border-t border-edge p-4">
                <input type="hidden" name="service_id" value={s.id} />
                {pk.length > 0 && (
                  <div><label className="label">Package (optional)</label>
                    <select name="package_id" className="input"><option value="">Not sure yet, talk to me</option>{pk.map((p) => { const own = p.prices?.[currency]; return <option key={p.id} value={p.id}>{p.name} · {own && own > 0 ? money(own, currency) : money(p.price_monthly, p.currency)}/mo</option>; })}</select></div>
                )}
                <div><label className="label">Anything we should know?</label><textarea name="note" rows={2} placeholder="Goals, deadlines, examples you like…" className="input" /></div>
                <button className="btn-primary w-full sm:w-auto">Send request</button>
              </Form>
            </details>
          );
        })}
      </div>
    </section>
  );
}
