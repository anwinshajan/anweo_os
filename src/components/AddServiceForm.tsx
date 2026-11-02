"use client";
import { useState } from "react";
import Form from "@/components/Form";
import { CURRENCIES, formatMoney } from "@/lib/currency";
import { assignServiceAction, createProjectAction } from "@/app/actions";

type Svc = { id: string; name: string };
type Pkg = { id: string; service_id: string; name: string; price_monthly: number; currency: string; prices: Record<string, number> | null };

const Seg = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${on ? "bg-forest text-paper shadow-card" : "text-ink/70 hover:text-ink"}`}>{children}</button>
);

// Add a service to a client: either a monthly (recurring) charge, or a one-time job with an advance and final payment.
export default function AddServiceForm({ clientId, currency, services, packages, canPrice }: { clientId: string; currency: string; services: Svc[]; packages: Pkg[]; canPrice: boolean }) {
  const [mode, setMode] = useState<"monthly" | "once">("monthly");
  const [svc, setSvc] = useState(services[0]?.id ?? "");
  const [pkg, setPkg] = useState("");
  const [price, setPrice] = useState("");
  const [cur, setCur] = useState(currency);
  const [name, setName] = useState("");
  const pkgs = packages.filter((p) => p.service_id === svc);
  const svcName = services.find((s) => s.id === svc)?.name ?? "";

  const pick = (id: string) => {
    setPkg(id);
    const p = packages.find((x) => x.id === id);
    if (!p) return;
    const own = p.prices?.[currency];
    if (own && own > 0) { setPrice(String(own)); setCur(currency); } else { setPrice(String(p.price_monthly)); setCur(p.currency); }
  };
  const currencyBox = (
    <select name="currency" value={cur} onChange={(e) => setCur(e.target.value)} className="input !w-28 shrink-0" aria-label="Currency">
      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
    </select>
  );
  const serviceSelect = (
    <div>
      <label className="label">Service</label>
      <select value={svc} onChange={(e) => { setSvc(e.target.value); setPkg(""); setPrice(""); }} className="input">
        {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );

  return (
    <div className="mt-5 space-y-4 border-t border-edge pt-5">
      <p className="font-semibold">Add a service</p>
      <div className="flex rounded-xl bg-paper p-1" role="tablist" aria-label="Payment type">
        <Seg on={mode === "monthly"} onClick={() => setMode("monthly")}>Monthly · recurring</Seg>
        <Seg on={mode === "once"} onClick={() => setMode("once")}>One-time</Seg>
      </div>

      {mode === "monthly" ? (
        <Form action={assignServiceAction} className="space-y-3" key="monthly">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="choice" value={`${svc}:${pkg}`} />
          <div className="grid gap-3 sm:grid-cols-2">
            {serviceSelect}
            <div>
              <label className="label">Package (optional)</label>
              <select value={pkg} onChange={(e) => pick(e.target.value)} className="input">
                <option value="">Custom, I'll type the price</option>
                {pkgs.map((p) => {
                  const own = p.prices?.[currency];
                  return <option key={p.id} value={p.id}>{p.name} · {own && own > 0 ? formatMoney(own, currency) : formatMoney(p.price_monthly, p.currency)}/mo</option>;
                })}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Price per month *</label>
            <div className="flex gap-2">{currencyBox}<input name="price_monthly" type="number" min="0" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 15000" className="input min-w-0 flex-1" /></div>
          </div>
          <button className="btn-primary w-full sm:w-auto" disabled={!svc}>Add monthly service</button>
          <p className="text-xs text-mute">Charged every month until you cancel it. It counts towards the client's monthly total.</p>
        </Form>
      ) : canPrice ? (
        <Form action={createProjectAction} className="space-y-3" key="once">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="visible" value="on" />
          <div className="grid gap-3 sm:grid-cols-2">
            {serviceSelect}
            <div><label className="label">Job name</label><input name="title" required value={name || svcName} onChange={(e) => setName(e.target.value)} className="input" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Total price *</label>
              <div className="flex gap-2">{currencyBox}<input name="price" type="number" min="0.01" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 60000" className="input min-w-0 flex-1" /></div>
            </div>
            <div>
              <label className="label">Advance</label>
              <select name="advance" defaultValue="50" className="input"><option value="0">None, pay on delivery</option><option value="30">30% now</option><option value="50">50% now</option><option value="70">70% now</option><option value="100">100% now</option></select>
            </div>
          </div>
          <button className="btn-primary w-full sm:w-auto" disabled={!svc}>Add one-time job</button>
          <p className="text-xs text-mute">Paid once. It appears in Projects so you can track it; the advance is invoiced now and the rest when you mark it completed.</p>
        </Form>
      ) : (
        <p className="rounded-xl bg-paper p-3 text-sm text-mute">Only the admin can set a price for one-time jobs.</p>
      )}
    </div>
  );
}
