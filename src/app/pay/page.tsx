import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, fmtDate, money, showTotals, statusPill, totals } from "@/components/Shell";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function MyPay() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const sb = await supabaseServer();
  // Row-level security means this only ever returns the signed-in person's own pay.
  const { data: pay } = await sb.from("pay_records").select("id,period_label,kind,amount,currency,status,paid_at,note").eq("staff_id", me.id).order("created_at", { ascending: false });
  const pending = totals((pay ?? []).filter((p) => p.status === "pending"));
  const paid = totals((pay ?? []).filter((p) => p.status === "paid"));

  return (
    <Shell me={me}>
      <PageHead tag="Private" title="My pay" sub="Only you and the founder can see this." />
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="card-green !p-4"><p className="tag !text-lime">On the way</p><p className="mt-2 text-2xl font-bold">{showTotals(pending)}</p></div>
        <div className="card !p-4"><p className="tag">Paid to date</p><p className="mt-2 text-2xl font-bold">{showTotals(paid)}</p></div>
      </div>
      <div className="space-y-2">
        {(pay ?? []).length === 0 && <Empty>No pay records yet.</Empty>}
        {(pay ?? []).map((p) => (
          <div key={p.id} className="row flex-wrap">
            <div className="min-w-0">
              <p className="font-medium capitalize">{p.kind} · {p.period_label}</p>
              <p className="font-mono text-[11px] text-mute">{p.paid_at ? `Paid ${fmtDate(p.paid_at)}` : "Not paid yet"}{p.note ? ` · ${p.note}` : ""}</p>
            </div>
            <span className="flex items-center gap-2"><span className="font-semibold">{money(p.amount, p.currency)}</span><span className={`pill ${statusPill(p.status)}`}>{p.status}</span></span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
