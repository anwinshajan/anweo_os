"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMe, supabaseAdmin, supabaseServer, type Role } from "@/lib/supabase-server";

async function requireLead() {
  const me = await getMe();
  if (!me || me.status !== "active" || !["admin", "manager"].includes(me.role)) {
    throw new Error("Not allowed");
  }
  return me;
}
async function requireStaff() {
  const me = await getMe();
  if (!me || me.status !== "active" || me.role === "client") throw new Error("Not allowed");
  return me;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

type Sb = Awaited<ReturnType<typeof supabaseServer>>;
// Activity history. `visible` rows are shown to the client in their timeline; the rest stay internal.
async function logEvent(sb: Sb, actor: string, client_id: string, action: string, detail: string, visible = false) {
  await sb.from("activity_log").insert({ actor, client_id, action, detail, client_visible: visible });
}

// ---------- Clients & services ----------
export async function createClientAction(form: FormData) {
  const me = await requireLead();
  const sb = await supabaseServer();
  const business_name = str(form, "business_name");
  if (!business_name) return;
  const { data, error } = await sb
    .from("clients")
    .insert({
      business_name,
      contact_name: str(form, "contact_name") || null,
      email: str(form, "email") || null,
      phone: str(form, "phone") || null,
      country: str(form, "country") || "India",
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logEvent(sb, me.id, data.id, "client_created", business_name, true);
  revalidatePath("/");
  redirect(`/clients/${data.id}`);
}

export async function assignServiceAction(form: FormData) {
  const me = await requireLead();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  // One combined choice: "<serviceId>:<packageId>" (package part empty for a custom price)
  const [service_id, pkgPart] = str(form, "choice").split(":");
  const package_id = pkgPart || null;
  const typed = str(form, "price_monthly");
  let currency = str(form, "currency") || "GBP";
  if (!client_id || !service_id) return;

  let price = typed === "" ? NaN : Number(typed);
  if (package_id) {
    const { data: pkg } = await sb
      .from("packages")
      .select("service_id,price_monthly,currency")
      .eq("id", package_id)
      .single();
    if (!pkg || pkg.service_id !== service_id) throw new Error("That package belongs to a different service");
    // A price typed by the manager wins (custom deal); otherwise use the package price.
    if (Number.isNaN(price)) {
      price = Number(pkg.price_monthly);
      currency = pkg.currency;
    }
  }
  if (!(price >= 0)) throw new Error("Enter a monthly price or pick a package");

  const { error } = await sb.from("client_services").upsert(
    { client_id, service_id, package_id, price_monthly: price, currency, status: "active", created_by: me.id },
    { onConflict: "client_id,service_id" }
  );
  if (error) throw new Error(error.message);
  const { data: svc } = await sb.from("services").select("name").eq("id", service_id).single();
  await logEvent(sb, me.id, client_id, "service_assigned", `Service added: ${svc?.name ?? ""}`, true);
  revalidatePath(`/clients/${client_id}`);
}

export async function removeServiceAction(form: FormData) {
  const me = await requireLead();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const client_id = str(form, "client_id");
  await sb.from("client_services").update({ status: "cancelled" }).eq("id", id);
  await logEvent(sb, me.id, client_id, "service_cancelled", "A service was cancelled", false);
  revalidatePath(`/clients/${client_id}`);
}

// ---------- Service catalogue & packages (admin / manager) ----------
export async function createServiceAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  const name = str(form, "name");
  if (!name) return;
  const { count } = await sb.from("services").select("id", { count: "exact", head: true });
  const { error } = await sb.from("services").insert({ name, description: str(form, "description") || null, sort_order: (count ?? 0) + 1 });
  if (error) throw new Error(error.message.includes("duplicate") ? "A service with that name already exists" : error.message);
  revalidatePath("/catalogue");
}

export async function toggleServiceAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  await sb.from("services").update({ active: str(form, "active") === "true" }).eq("id", str(form, "id"));
  revalidatePath("/catalogue");
}

export async function createPackageAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  const service_id = str(form, "service_id");
  const name = str(form, "name");
  const price = Number(str(form, "price_monthly"));
  if (!service_id || !name || !(price >= 0)) return;
  const features = str(form, "features").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20);
  const { error } = await sb.from("packages").insert({
    service_id, name, price_monthly: price, currency: str(form, "currency") || "GBP",
    description: str(form, "description") || null, features,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/catalogue");
}

export async function togglePackageAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  await sb.from("packages").update({ active: str(form, "active") === "true" }).eq("id", str(form, "id"));
  revalidatePath("/catalogue");
}

// ---------- Work items ----------
export async function addWorkAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const title = str(form, "title");
  if (!client_id || !title) return;
  const visible = form.get("visible") === "on";
  const { error } = await sb.from("work_items").insert({
    client_id,
    title,
    service_id: str(form, "service_id") || null,
    due_date: str(form, "due_date") || null,
    visible_to_client: visible,
  });
  if (error) throw new Error(error.message);
  await logEvent(sb, me.id, client_id, "work_added", title, false);
  revalidatePath(`/clients/${client_id}`);
}

export async function setWorkStatusAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const allowed = ["todo", "in_progress", "review", "done"];
  const status = str(form, "status");
  const id = str(form, "id");
  const client_id = str(form, "client_id");
  if (!allowed.includes(status)) return;
  const { data: w } = await sb.from("work_items").update({ status }).eq("id", id).select("title,visible_to_client").single();
  if (w && status === "done") {
    // Only completed tasks the client can already see appear in their timeline.
    await logEvent(sb, me.id, client_id, "work_done", `Completed: ${w.title}`, w.visible_to_client);
  }
  revalidatePath(`/clients/${client_id}`);
}

// ---------- Social posts ----------
export async function addPostAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  if (!client_id) return;
  const when = str(form, "scheduled_at");
  const { error } = await sb.from("social_posts").insert({
    client_id,
    kind: str(form, "kind") || "post",
    platform: str(form, "platform") || "instagram",
    caption: str(form, "caption") || null,
    scheduled_at: when ? new Date(when).toISOString() : null,
    status: "awaiting_approval",
    created_by: me.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/approvals");
}

// Only admin/manager can approve, reject, or mark posted. RLS also enforces social access.
export async function reviewPostAction(form: FormData) {
  const me = await requireLead();
  const sb = await supabaseServer();
  const decision = str(form, "decision"); // approve | reject | posted
  const id = str(form, "id");
  const next =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : decision === "posted" ? "posted" : null;
  if (!next) return;
  const patch: Record<string, unknown> = { status: next };
  if (next === "approved") patch.approved_by = me.id;
  if (next === "posted") patch.posted_at = new Date().toISOString();
  const { data: p } = await sb.from("social_posts").update(patch).eq("id", id).select("client_id,kind,platform").single();
  if (p && next !== "rejected") {
    const text = next === "approved" ? `Approved: ${p.kind} for ${p.platform}` : `Published: ${p.kind} on ${p.platform}`;
    await logEvent(sb, me.id, p.client_id, next === "approved" ? "post_approved" : "post_published", text, true);
  }
  revalidatePath("/approvals");
  revalidatePath("/");
}

// ---------- Invoices ----------
export async function addInvoiceAction(form: FormData) {
  const me = await requireLead();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const amount = Number(str(form, "amount"));
  if (!client_id || !(amount > 0)) return;
  const period = str(form, "period_label") || new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  await sb.from("invoices").insert({
    client_id,
    period_label: period,
    amount,
    currency: str(form, "currency") || "GBP",
    status: "due",
  });
  await logEvent(sb, me.id, client_id, "invoice_issued", `Invoice issued: ${period}`, true);
  revalidatePath(`/clients/${client_id}`);
}

export async function markInvoicePaidAction(form: FormData) {
  const me = await requireLead();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const { data: inv } = await sb
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) })
    .eq("id", str(form, "id"))
    .select("period_label")
    .single();
  if (inv) await logEvent(sb, me.id, client_id, "invoice_paid", `Payment received: ${inv.period_label}`, true);
  revalidatePath(`/clients/${client_id}`);
}

// ---------- Team & client logins (admin only, service role) ----------
export async function createLoginAction(form: FormData) {
  const me = await getMe();
  if (!me || me.status !== "active" || me.role !== "admin") throw new Error("Admins only");

  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const full_name = str(form, "full_name");
  const role = str(form, "role") as Role;
  const client_id = str(form, "client_id") || null;
  const can_manage_social = form.get("can_manage_social") === "on";

  if (!email || password.length < 10) throw new Error("Email and a password of 10+ characters are required");
  if (!["admin", "manager", "developer", "client"].includes(role)) throw new Error("Bad role");
  if (role === "client" && !client_id) throw new Error("Pick the client this login belongs to");

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create user");

  const { error: pErr } = await admin
    .from("profiles")
    .update({
      full_name,
      role,
      status: "active",
      client_id: role === "client" ? client_id : null,
      can_manage_social: role === "developer" ? can_manage_social : false,
    })
    .eq("id", data.user.id);
  if (pErr) throw new Error(pErr.message);
  revalidatePath("/team");
}

export async function setAccountStatusAction(form: FormData) {
  const me = await getMe();
  if (!me || me.role !== "admin" || me.status !== "active") throw new Error("Admins only");
  const id = str(form, "id");
  const status = str(form, "status");
  if (id === me.id) return; // never lock yourself out
  if (!["active", "disabled"].includes(status)) return;
  await supabaseAdmin().from("profiles").update({ status }).eq("id", id);
  revalidatePath("/team");
}

export async function signOutAction() {
  await (await supabaseServer()).auth.signOut();
  redirect("/login");
}
