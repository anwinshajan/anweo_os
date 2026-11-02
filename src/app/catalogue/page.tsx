import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, money } from "@/components/Shell";
import { createPackageAction, createServiceAction, togglePackageAction, toggleServiceAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Catalogue() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !["admin", "manager"].includes(me.role)) redirect("/");
  const sb = await supabaseServer();

  const [{ data: services }, { data: packages }] = await Promise.all([
    sb.from("services").select("id,name,description,active").order("sort_order"),
    sb.from("packages").select("id,service_id,name,description,price_monthly,currency,features,active").order("price_monthly"),
  ]);

  return (
    <Shell me={me}>
      <PageHead
        tag="Catalogue"
        title="Services & packages"
        sub="What Anweo sells. Create packages here, then pick them when adding a service to a client. Prices fill in automatically."
      />

      <details className="card group mb-5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          <span>Add a service</span><span className="btn-lime !px-3 !py-1 text-xs group-open:hidden">+ New</span>
        </summary>
        <form action={createServiceAction} className="mt-5 grid gap-3 sm:grid-cols-3">
          <div><label className="label">Name *</label><input name="name" required className="input" placeholder="e.g. Brand Identity" /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><input name="description" className="input" /></div>
          <div className="sm:col-span-3"><button className="btn-primary">Create service</button></div>
        </form>
      </details>

      <div className="space-y-5">
        {(services ?? []).length === 0 && <Empty>No services yet.</Empty>}
        {(services ?? []).map((s) => {
          const pkgs = (packages ?? []).filter((p) => p.service_id === s.id);
          return (
            <section key={s.id} className={`card ${s.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold tracking-tight">{s.name}</h2>
                  {s.description && <p className="mt-0.5 text-sm text-mute">{s.description}</p>}
                </div>
                <form action={toggleServiceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button name="active" value={s.active ? "false" : "true"} className="btn-ghost !px-3 !py-1.5 text-xs">{s.active ? "Hide service" : "Show service"}</button>
                </form>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pkgs.length === 0 && <p className="text-sm text-mute sm:col-span-3">No packages yet. Add one below.</p>}
                {pkgs.map((p) => (
                  <div key={p.id} className={`flex flex-col rounded-xl border border-edge bg-paper/60 p-4 ${p.active ? "" : "opacity-50"}`}>
                    <p className="font-semibold">{p.name}</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-forest">{money(p.price_monthly, p.currency)}<span className="text-xs font-medium text-mute"> /mo</span></p>
                    {p.description && <p className="mt-1 text-xs text-mute">{p.description}</p>}
                    {Array.isArray(p.features) && p.features.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm">
                        {(p.features as string[]).map((f) => (
                          <li key={f} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-deep" />{f}</li>
                        ))}
                      </ul>
                    )}
                    <form action={togglePackageAction} className="mt-4">
                      <input type="hidden" name="id" value={p.id} />
                      <button name="active" value={p.active ? "false" : "true"} className="text-xs font-medium text-mute hover:text-ink hover:underline">{p.active ? "Retire package" : "Bring back"}</button>
                    </form>
                  </div>
                ))}
              </div>

              <details className="mt-4 border-t border-edge pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-forest">+ Add a package</summary>
                <form action={createPackageAction} className="mt-4 grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="service_id" value={s.id} />
                  <div className="sm:col-span-2"><label className="label">Package name *</label><input name="name" required placeholder="e.g. Growth" className="input" /></div>
                  <div><label className="label">Monthly price *</label><input name="price_monthly" type="number" min="0" step="0.01" required className="input" /></div>
                  <div><label className="label">Currency</label><select name="currency" className="input"><option>GBP</option><option>INR</option></select></div>
                  <div className="sm:col-span-4"><label className="label">Short description</label><input name="description" className="input" /></div>
                  <div className="sm:col-span-4"><label className="label">What's included (one per line)</label><textarea name="features" rows={4} placeholder={"12 posts per month\n4 reels\nMonthly report"} className="input" /></div>
                  <div className="sm:col-span-4"><button className="btn-primary">Save package</button></div>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
