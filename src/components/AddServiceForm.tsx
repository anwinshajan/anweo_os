"use client";
import { useState } from "react";
import Form from "@/components/Form";
import { CURRENCIES, formatMoney } from "@/lib/currency";
import { assignServiceAction } from "@/app/actions";

type Svc = { id: string; name: string };
type Pkg = { id: string; service_id: string; name: string; price_monthly: number; currency: string; prices: Record<string, number> | null };

// Pick a service, optionally a package, and the monthly price fills in (you can change it).
export default function AddServiceForm({ clientId, currency, services, packages }: { clientId: string; currency: string; services: Svc[]; packages: Pkg[] }) {
  const [svc, setSvc] = useState(services[0]?.id ?? "");
  const [pkg, setPkg] = useState("");
  const [price, setPrice] = useState("");
  const [cur, setCur] = useState(currency);
  const pkgs = packages.filter((p) => p.service_id === svc);

  const pick = (id: string) => {
    setPkg(id);
    const p = packages.find((x) => x.id === id);
    if (!p) return;
    const own = p.prices?.[currency];
    if (own && own > 0) { setPrice(String(own)); setCur(currency); } else { setPrice(String(p.price_monthly)); setCur(p.currency); }
  };

  return (
    <Form action={assignServiceAction} className="mt-5 space-y-3 border-t border-edge pt-5">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="choice" value={`${svc}:${pkg}`} />
      <p className="font-semibold">Add a service</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">1 · Service</label>
          <select value={svc} onChange={(e) => { setSvc(e.target.value); setPkg(""); setPrice(""); }} className="input">
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">2 · Package (optional)</label>
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
        <label className="label">3 · Price per month *</label>
        <div className="flex gap-2">
          <select name="currency" value={cur} onChange={(e) => setCur(e.target.value)} className="input !w-28 shrink-0" aria-label="Currency">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
          <input name="price_monthly" type="number" min="0" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 15000" className="input min-w-0 flex-1" />
        </div>
      </div>
      <button className="btn-primary w-full sm:w-auto" disabled={!svc}>Add service</button>
      <p className="text-xs text-mute">This is a monthly charge. For a one-off job like a website, create a project in the Projects tab and put the price there.</p>
    </Form>
  );
}
