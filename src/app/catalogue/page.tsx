import { redirect } from "next/navigation";
import Form from "@/components/Form";
import Shell, { Empty, PageHead, money } from "@/components/Shell";
import CurrencySelect from "@/components/CurrencySelect";
import { createPackageAction, createServiceAction, togglePackageAction, toggleServiceAction, updatePackageAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { CURRENCIES } from "@/lib/currency";

export const dynamic = "force-dynamic";

type Pkg = { id: string; service_id: string; name: string; description: string | null; price_monthly: number; currency: string; prices: Record<string, number> | null; features: string[] | null; active: boolean };

// The base price plus any extra currencies, e.g. "£300 · ₹30,000 · $380"
const allPrices = (p: Pkg) => [money(p.price_monthly, p.currency), ...Object.entries(p.prices ?? {}).map(([c, v]) => money(v, c))];

function PriceInputs({ pkg, base, compact = false }: { pkg?: Pkg; base: string; compact?: boolean }) {
  return (
    <div className="sm:col-span-4">
      <label className="label">Also sold in (leave blank if you don't sell it in that currency)</label>
      <div className={`grid grid-cols-2 gap-2 ${compact ? "" : "sm:grid-cols-5"}`}>
        {CURRENCIES.filter((c) => c.code !== base).map((c) => (
          <label key={c.code} className="flex items-center gap-2 rounded-xl border border-edge bg-white px-3 py-2 text-xs">
            <span className="font-mono font-semibold text-forest">{c.code}</span>
            <input name={`price_${c.code}`} type="number" min="0" step="0.01" defaultValue={pkg?.prices?.[c.code] ?? ""} placeholder="-" className="min-w-0 flex-1 bg-transparent font-semibold outline-none" aria-label={`Price in ${c.code}`} />
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-mute">When you add this package to a client, their own currency's price is used automatically.</p>
    </div>
  );
}

export default async function Catalogue() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !["admin", "manager"].includes(me.role)) redirect("/");
  const sb = await supabaseServer();

  const [{ data: services }, { data: packages }] = await Promise.all([
    sb.from("services").select("id,name,description,active").order("sort_order"),
    sb.from("packages").select("id,service_id,name,description,price_monthly,currency,prices,features,active").order("price_monthly"),
  ]);

  return (
    <Shell me={me}>
      <PageHead
        tag="Catalogue"
        title="Services & packages"
        sub="What Anweo sells. Give each package a price in every currency you sell it in. The right price is picked automatically for each client."
      />

      <details className="card group mb-5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          <span>Add a service</span><span className="btn-lime !px-3 !py-1 text-xs group-open:hidden">+ New</span>
        </summary>
        <Form action={createServiceAction} className="mt-5 grid gap-3 sm:grid-cols-3">
          <div><label className="label">Name *</label><input name="name" required className="input" placeholder="e.g. Brand Identity" /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><input name="description" className="input" /></div>
          <div className="sm:col-span-3"><button className="btn-primary">Create service</button></div>
        </Form>
      </details>

      <div className="space-y-5">
        {(services ?? []).length === 0 && <Empty>No services yet.</Empty>}
        {(services ?? []).map((s) => {
          const pkgs = ((packages ?? []) as Pkg[]).filter((p) => p.service_id === s.id);
          return (
            <section key={s.id} className={`card ${s.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold tracking-tight">{s.name}</h2>
                  {s.description && <p className="mt-0.5 text-sm text-mute">{s.description}</p>}
                </div>
                <Form action={toggleServiceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button name="active" value={s.active ? "false" : "true"} className="btn-ghost !px-3 !py-1.5 text-xs">{s.active ? "Hide service" : "Show service"}</button>
                </Form>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pkgs.length === 0 && <p className="text-sm text-mute sm:col-span-3">No packages yet. Add one below.</p>}
                {pkgs.map((p) => {
                  const [first, ...rest] = allPrices(p);
                  return (
                    <div key={p.id} className={`flex flex-col rounded-xl border border-edge bg-paper/60 p-4 ${p.active ? "" : "opacity-50"}`}>
                      <p className="font-semibold">{p.name}</p>
                      <p className="mt-1 text-2xl font-bold tracking-tight text-forest">{first}<span className="text-xs font-medium text-mute"> /mo</span></p>
                      {rest.length > 0 && <p className="mt-0.5 font-mono text-[11px] text-mute">{rest.join(" · ")}</p>}
                      {p.description && <p className="mt-1 text-xs text-mute">{p.description}</p>}
                      {Array.isArray(p.features) && p.features.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {p.features.map((f) => (
                            <li key={f} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-deep" />{f}</li>
                          ))}
                        </ul>
                      )}
                      <details className="mt-4 border-t border-edge pt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-forest">Edit prices & details</summary>
                        <Form action={updatePackageAction} className="mt-3 grid gap-3 sm:grid-cols-4">
                          <input type="hidden" name="id" value={p.id} />
                          <div className="sm:col-span-4"><label className="label">Name</label><input name="name" required defaultValue={p.name} className="input" /></div>
                          <div className="sm:col-span-2"><label className="label">Main price</label><input name="price_monthly" type="number" min="0" step="0.01" required defaultValue={p.price_monthly} className="input" /></div>
                          <div className="sm:col-span-2"><label className="label">Main currency</label><CurrencySelect defaultValue={p.currency} short /></div>
                          <PriceInputs pkg={p} base={p.currency} compact />
                          <div className="sm:col-span-4"><label className="label">Short description</label><input name="description" defaultValue={p.description ?? ""} className="input" /></div>
                          <div className="sm:col-span-4"><label className="label">What's included (one per line)</label><textarea name="features" rows={4} defaultValue={(p.features ?? []).join("\n")} className="input" /></div>
                          <div className="sm:col-span-4"><button className="btn-primary">Save package</button></div>
                        </Form>
                      </details>
                      <Form action={togglePackageAction} className="mt-3">
                        <input type="hidden" name="id" value={p.id} />
                        <button name="active" value={p.active ? "false" : "true"} className="text-xs font-medium text-mute hover:text-ink hover:underline">{p.active ? "Retire package" : "Bring back"}</button>
                      </Form>
                    </div>
                  );
                })}
              </div>

              <details className="mt-4 border-t border-edge pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-forest">+ Add a package</summary>
                <Form action={createPackageAction} className="mt-4 grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="service_id" value={s.id} />
                  <div className="sm:col-span-2"><label className="label">Package name *</label><input name="name" required placeholder="e.g. Growth" className="input" /></div>
                  <div><label className="label">Main price *</label><input name="price_monthly" type="number" min="0" step="0.01" required className="input" /></div>
                  <div><label className="label">Main currency</label><CurrencySelect /></div>
                  <PriceInputs base="GBP" />
                  <div className="sm:col-span-4"><label className="label">Short description</label><input name="description" className="input" /></div>
                  <div className="sm:col-span-4"><label className="label">What's included (one per line)</label><textarea name="features" rows={4} placeholder={"12 posts per month\n4 reels\nMonthly report"} className="input" /></div>
                  <div className="sm:col-span-4"><button className="btn-primary">Save package</button></div>
                </Form>
                <p className="mt-2 text-xs text-mute">The extra-price boxes above are for currencies other than GBP. If you pick a different main currency, its own box is ignored.</p>
              </details>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
