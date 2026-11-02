import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, statusPill } from "@/components/Shell";
import { createLoginAction, setAccountStatusAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const roleName: Record<string, string> = { admin: "Founder / Admin", manager: "Manager", developer: "Developer", client: "Client" };

export default async function Team() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role !== "admin") redirect("/");
  const sb = await supabaseServer();
  const [{ data: people }, { data: clients }] = await Promise.all([
    sb.from("profiles").select("id,full_name,email,role,status,can_manage_social,clients(business_name)").order("created_at"),
    sb.from("clients").select("id,business_name").order("business_name"),
  ]);
  const staff = (people ?? []).filter((p: any) => p.role !== "client");
  const clientLogins = (people ?? []).filter((p: any) => p.role === "client");

  const PersonRow = ({ p }: { p: any }) => (
    <div className="row flex-wrap">
      <div className="min-w-0">
        <p className="truncate font-medium">{p.full_name || p.email}</p>
        <p className="truncate font-mono text-[11px] text-mute">{p.email} · {roleName[p.role]}{p.clients?.business_name ? ` · ${p.clients.business_name}` : ""}{p.role === "developer" && p.can_manage_social ? " · social access" : ""}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`pill ${statusPill(p.status)}`}>{p.status}</span>
        {p.id !== me.id && (
          <form action={setAccountStatusAction}>
            <input type="hidden" name="id" value={p.id} />
            <button name="status" value={p.status === "active" ? "disabled" : "active"} className="btn-ghost !px-3 !py-1.5 text-xs">{p.status === "active" ? "Disable" : "Activate"}</button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <Shell me={me}>
      <PageHead tag="Admin" title="Team & logins" sub="Create logins for your team and for clients. Only admins can do this." />

      <details className="card group mb-6">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          <span>Create a login</span><span className="btn-lime !px-3 !py-1 text-xs group-open:hidden">+ New</span>
        </summary>
        <form action={createLoginAction} className="mt-5 grid gap-3 sm:grid-cols-2">
          <div><label className="label">Full name</label><input name="full_name" required className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
          <div><label className="label">Temporary password (10+ characters)</label><input name="password" type="password" minLength={10} required autoComplete="new-password" className="input" /></div>
          <div><label className="label">Role</label>
            <select name="role" className="input" defaultValue="client">
              <option value="client">Client</option><option value="developer">Developer</option>
              <option value="manager">Manager</option><option value="admin">Admin / Founder</option>
            </select></div>
          <div><label className="label">Client (for client logins)</label>
            <select name="client_id" className="input"><option value="">None</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select></div>
          <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" name="can_manage_social" className="h-4 w-4 accent-forest" /> Developer can manage social posts</label>
          <div className="sm:col-span-2"><button className="btn-primary">Create login</button></div>
        </form>
      </details>

      <section className="mb-6">
        <p className="tag mb-3">[ Team · {staff.length} ]</p>
        <div className="space-y-2">{staff.length === 0 ? <Empty>No team members yet.</Empty> : staff.map((p: any) => <PersonRow key={p.id} p={p} />)}</div>
      </section>
      <section>
        <p className="tag mb-3">[ Client logins · {clientLogins.length} ]</p>
        <div className="space-y-2">{clientLogins.length === 0 ? <Empty>No client logins yet. Create one above and link it to a client.</Empty> : clientLogins.map((p: any) => <PersonRow key={p.id} p={p} />)}</div>
      </section>
    </Shell>
  );
}
