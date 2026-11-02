import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { PageHead } from "@/components/Shell";
import ChangePassword from "@/components/ChangePassword";
import { updateOwnProfileAction } from "@/app/actions";
import { getMe } from "@/lib/supabase-server";
import { roleLabel } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function Account() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  return (
    <Shell me={me}>
      <PageHead tag="Account" title="My account" sub={`${me.email} · ${me.job_title || roleLabel[me.role]}`} />
      <div className="grid max-w-3xl gap-5">
        <section className="card">
          <p className="tag mb-3">[ Profile ]</p>
          <form action={updateOwnProfileAction} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Full name</label><input name="full_name" required defaultValue={me.full_name ?? ""} className="input" autoComplete="name" /></div>
            <div><label className="label">Phone / WhatsApp</label><input name="phone" defaultValue={me.phone ?? ""} className="input" autoComplete="tel" /></div>
            <div className="sm:col-span-2"><button className="btn-primary">Save profile</button></div>
          </form>
        </section>
        <section className="card">
          <p className="tag mb-3">[ Password ]</p>
          <ChangePassword />
        </section>
        {me.role !== "client" && (
          <section className="card">
            <p className="tag mb-3">[ Quick links ]</p>
            <div className="flex flex-wrap gap-2"><Link href="/pay" className="btn-ghost">My pay</Link><Link href="/tasks" className="btn-ghost">My tasks</Link><Link href="/chat/ai" className="btn-ghost">Anweo AI</Link></div>
          </section>
        )}
        <section className="card">
          <p className="tag mb-3">[ Install Anweo on your phone ]</p>
          <p className="text-sm text-ink/80"><strong>Android:</strong> in Chrome, tap the menu, then “Install app”. <strong>iPhone:</strong> in Safari, tap Share, then “Add to Home Screen”.</p>
        </section>
      </div>
    </Shell>
  );
}
