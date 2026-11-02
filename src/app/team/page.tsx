import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, statusPill } from "@/components/Shell";
import { createLoginAction, setAccountStatusAction, updateMemberAction } from "@/app/actions";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { STAFF_ROLES, isAdminRole, roleLabel } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function Team() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || !isAdminRole(me.role)) redirect("/");
  const sb = await supabaseServer();
  const [{ data: people }, { data: clients }] = await Promise.all([
    sb.from("profiles").select("id,full_name,email,role,status,can_manage_social,job_title,phone,clients(business_name)").order("created_at"),
    sb.from("clients").select("id,business_name").order("business_name"),
  ]);
  const staff = (people ?? []).filter((p: any) => p.role !== "client");
  const clientLogins = (people ?? []).filter((p: any) => p.role === "client");

  return (
    <Shell me={me}>
      <PageHead tag="Admin" title="Team & logins" sub="Create logins for your team and for clients, and set what each person can do. Only admins can do this." />

      <details className="card group mb-6" open>
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          <span>Create a login</span><span className="btn-lime !px-3 !py-1 text-xs group-open:hidden">+ New</span>
        </summary>
        <form action={createLoginAction} className="mt-5 grid gap-3 sm:grid-cols-2">
          <div><label className="label">Full name</label><input name="full_name" required className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
          <div><label className="label">Temporary password (10+ characters)</label><input name="password" type="password" minLength={10} required autoComplete="new-password" className="input" /></div>
          <div><label className="label">Role</label>
            <select name="role" className="input" defaultValue="client">
              <option value="client">Client</option>
              {STAFF_ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select></div>
          <div><label className="label">Client (for client logins only)</label>
            <select name="client_id" className="input"><option value="">None</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select></div>
          <div><label className="label">Job title (optional)</label><input name="job_title" placeholder="e.g. Senior editor" className="input" /></div>
          <div><label className="label">Phone / WhatsApp (optional)</label><input name="phone" className="input" /></div>
          <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" name="can_manage_social" className="h-4 w-4 accent-forest" /> Can also create social posts</label>
          <div className="sm:col-span-2"><button className="btn-primary">Create login</button></div>
        </form>
        <p className="mt-3 text-xs text-mute">Tell the person to change their password under My account after their first sign-in.</p>
      </details>

      <section className="mb-6">
        <p className="tag mb-3">[ Team · {staff.length} ]</p>
        <div className="space-y-2">
          {staff.length === 0 && <Empty>No team members yet.</Empty>}
          {staff.map((p: any) => (
            <details key={p.id} className="card !p-4">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.full_name || p.email}{p.id === me.id && <span className="ml-2 font-mono text-[10px] uppercase text-mute">you</span>}</p>
                  <p className="truncate font-mono text-[11px] text-mute">{p.email} · {p.job_title || roleLabel[p.role as keyof typeof roleLabel]}{p.can_manage_social && p.role !== "admin" && p.role !== "manager" && p.role !== "social_manager" ? " · social access" : ""}</p>
                </div>
                <span className={`pill ${statusPill(p.status)}`}>{p.status}</span>
              </summary>
              <div className="mt-4 grid gap-3 border-t border-edge pt-4 sm:grid-cols-3">
                <form action={updateMemberAction} className="grid gap-3 sm:col-span-3 sm:grid-cols-4">
                  <input type="hidden" name="id" value={p.id} />
                  <div><label className="label">Role</label>
                    <select name="role" defaultValue={p.role} className="input">{STAFF_ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</select></div>
                  <div className="sm:col-span-2"><label className="label">Job title</label><input name="job_title" defaultValue={p.job_title ?? ""} className="input" /></div>
                  <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" name="can_manage_social" defaultChecked={p.can_manage_social} className="h-4 w-4 accent-forest" /> Social posts</label>
                  <div className="sm:col-span-4"><button className="btn-primary">Save changes</button></div>
                </form>
                {p.id !== me.id && (
                  <form action={setAccountStatusAction} className="sm:col-span-3">
                    <input type="hidden" name="id" value={p.id} />
                    <button name="status" value={p.status === "active" ? "disabled" : "active"} className="btn-ghost text-xs">{p.status === "active" ? "Disable this login" : "Re-enable this login"}</button>
                  </form>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section>
        <p className="tag mb-3">[ Client logins · {clientLogins.length} ]</p>
        <div className="space-y-2">
          {clientLogins.length === 0 ? <Empty>No client logins yet. Create one above and link it to a client.</Empty> : clientLogins.map((p: any) => (
            <div key={p.id} className="row flex-wrap">
              <div className="min-w-0"><p className="truncate font-medium">{p.full_name || p.email}</p><p className="truncate font-mono text-[11px] text-mute">{p.email} · {p.clients?.business_name ?? "not linked"}</p></div>
              <div className="flex items-center gap-2">
                <span className={`pill ${statusPill(p.status)}`}>{p.status}</span>
                <form action={setAccountStatusAction}><input type="hidden" name="id" value={p.id} /><button name="status" value={p.status === "active" ? "disabled" : "active"} className="btn-ghost !px-3 !py-1.5 text-xs">{p.status === "active" ? "Disable" : "Activate"}</button></form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
