"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMe, supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { STAFF_ROLES, isAdminRole, isLeadRole, type Role } from "@/lib/roles";
import { BASE_CURRENCY, CURRENCIES, currencyForCountry, isCurrency } from "@/lib/currency";

/* ------------------------------------------------------------------ guards */
async function requireActive() {
  const me = await getMe();
  if (!me || me.status !== "active") throw new Error("Please sign in again");
  return me;
}
async function requireStaff() {
  const me = await requireActive();
  if (me.role === "client") throw new Error("Not allowed");
  return me;
}
async function requireLead() {
  const me = await requireActive();
  if (!isLeadRole(me.role)) throw new Error("Only a manager or admin can do that");
  return me;
}
async function requireAdmin() {
  const me = await requireActive();
  if (!isAdminRole(me.role)) throw new Error("Only the admin can do that");
  return me;
}
const canSocial = (me: { role: Role; can_manage_social: boolean }) =>
  isLeadRole(me.role) || me.role === "social_manager" || me.can_manage_social;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(str(f, k));
// A valid currency code from a form, or the fallback.
const cur = (f: FormData, k: string, fallback: string = BASE_CURRENCY) => (isCurrency(str(f, k)) ? str(f, k) : fallback);

type Sb = Awaited<ReturnType<typeof supabaseServer>>;
// Activity history. `visible` rows appear in the client's timeline; the rest stay internal.
async function logEvent(sb: Sb, actor: string, client_id: string, action: string, detail: string, visible = false) {
  await sb.from("activity_log").insert({ actor, client_id, action, detail, client_visible: visible });
}

/* ------------------------------------------------------------------ clients */
export async function createClientAction(form: FormData) {
  const me = await requireLead();
  const sb = await supabaseServer();
  const business_name = str(form, "business_name");
  if (!business_name) throw new Error("Please enter the business name");
  const country = str(form, "country") || "India";
  const { data, error } = await sb
    .from("clients")
    .insert({
      business_name,
      contact_name: str(form, "contact_name") || null,
      email: str(form, "email") || null,
      phone: str(form, "phone") || null,
      country,
      currency: cur(form, "currency", currencyForCountry(country)),
      notes: str(form, "notes") || null,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logEvent(sb, me.id, data.id, "client_created", "Welcome to Anweo", true);
  revalidatePath("/");
  redirect(`/clients/${data.id}`);
}

export async function updateClientAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const business_name = str(form, "business_name");
  if (!id || !business_name) throw new Error("Business name is required");
  const { error } = await sb
    .from("clients")
    .update({
      business_name,
      contact_name: str(form, "contact_name") || null,
      email: str(form, "email") || null,
      phone: str(form, "phone") || null,
      country: str(form, "country") || "India",
      currency: cur(form, "currency", currencyForCountry(str(form, "country") || "India")),
      notes: str(form, "notes") || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/");
}

export async function setClientStatusAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const status = str(form, "status") === "archived" ? "archived" : "active";
  await sb.from("clients").update({ status }).eq("id", id);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/");
}

/* ------------------------------------------------------------------ services on a client */
export async function assignServiceAction(form: FormData) {
  const me = await requireLead();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  // One combined choice: "<serviceId>:<packageId>" (package part empty for a custom price)
  const [service_id, pkgPart] = str(form, "choice").split(":");
  const package_id = pkgPart || null;
  const typed = str(form, "price_monthly");
  if (!client_id || !service_id) return;

  const { data: client } = await sb.from("clients").select("currency").eq("id", client_id).single();
  if (!client) throw new Error("Client not found");
  let currency = cur(form, "currency", client.currency);

  let price = typed === "" ? NaN : Number(typed);
  if (package_id) {
    const { data: pkg } = await sb.from("packages").select("service_id,price_monthly,currency,prices").eq("id", package_id).single();
    if (!pkg || pkg.service_id !== service_id) throw new Error("That package belongs to a different service");
    if (Number.isNaN(price)) {
      // Prefer the package's price in the client's own currency; otherwise fall back to its base price.
      const own = (pkg.prices as Record<string, number> | null)?.[client.currency];
      if (own !== undefined && own > 0) { price = Number(own); currency = client.currency; }
      else { price = Number(pkg.price_monthly); currency = pkg.currency; }
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
  const client_id = str(form, "client_id");
  await sb.from("client_services").update({ status: "cancelled" }).eq("id", str(form, "id"));
  await logEvent(sb, me.id, client_id, "service_cancelled", "A service was cancelled", false);
  revalidatePath(`/clients/${client_id}`);
}

/* ------------------------------------------------------------------ catalogue */
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
// Extra prices typed as price_INR, price_USD ... (blank = none). The base currency has its own field.
function extraPrices(form: FormData, baseCurrency: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CURRENCIES) {
    if (c.code === baseCurrency) continue;
    const v = Number(str(form, `price_${c.code}`));
    if (str(form, `price_${c.code}`) !== "" && v > 0) out[c.code] = v;
  }
  return out;
}

export async function createPackageAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  const service_id = str(form, "service_id");
  const name = str(form, "name");
  const price = num(form, "price_monthly");
  if (!service_id || !name || !(price >= 0)) return;
  const currency = cur(form, "currency");
  const features = str(form, "features").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20);
  const { error } = await sb.from("packages").insert({
    service_id, name, price_monthly: price, currency,
    prices: extraPrices(form, currency),
    description: str(form, "description") || null, features,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/catalogue");
}

export async function updatePackageAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const name = str(form, "name");
  const price = num(form, "price_monthly");
  if (!id || !name || !(price >= 0)) throw new Error("Give the package a name and a price");
  const currency = cur(form, "currency");
  const features = str(form, "features").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20);
  const { error } = await sb.from("packages").update({
    name, price_monthly: price, currency, prices: extraPrices(form, currency),
    description: str(form, "description") || null, features,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/catalogue");
}
export async function togglePackageAction(form: FormData) {
  await requireLead();
  const sb = await supabaseServer();
  await sb.from("packages").update({ active: str(form, "active") === "true" }).eq("id", str(form, "id"));
  revalidatePath("/catalogue");
}

/* ------------------------------------------------------------------ work / tasks */
export async function addWorkAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const title = str(form, "title");
  if (!client_id || !title) return;
  const { error } = await sb.from("work_items").insert({
    client_id,
    title,
    service_id: str(form, "service_id") || null,
    assignee: str(form, "assignee") || null,
    due_date: str(form, "due_date") || null,
    visible_to_client: form.get("visible") === "on",
  });
  if (error) throw new Error(error.message);
  await logEvent(sb, me.id, client_id, "work_added", title, false);
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/tasks");
}

export async function setWorkStatusAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const status = str(form, "status");
  const id = str(form, "id");
  const client_id = str(form, "client_id");
  if (!["todo", "in_progress", "review", "done"].includes(status)) return;
  const { data: w } = await sb.from("work_items").update({ status }).eq("id", id).select("title,visible_to_client,client_id").single();
  if (w && status === "done") {
    await logEvent(sb, me.id, w.client_id, "work_done", `Completed: ${w.title}`, w.visible_to_client);
  }
  revalidatePath(`/clients/${client_id || w?.client_id}`);
  revalidatePath("/tasks");
}

/* ------------------------------------------------------------------ projects & milestones */
export async function createProjectAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const title = str(form, "title");
  if (!client_id || !title) throw new Error("Give the project a title");
  const { error } = await sb.from("projects").insert({
    client_id,
    title,
    description: str(form, "description") || null,
    start_date: str(form, "start_date") || null,
    due_date: str(form, "due_date") || null,
    visible_to_client: form.get("visible") === "on",
    created_by: me.id,
  });
  if (error) throw new Error(error.message);
  if (form.get("visible") === "on") await logEvent(sb, me.id, client_id, "project_created", `New project: ${title}`, true);
  revalidatePath(`/clients/${client_id}`);
}

export async function setProjectStatusAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const status = str(form, "status");
  if (!["planning", "in_progress", "review", "completed", "on_hold"].includes(status)) return;
  const { data: p } = await sb.from("projects").update({ status }).eq("id", str(form, "id")).select("client_id,title,visible_to_client").single();
  if (p && status === "completed") await logEvent(sb, me.id, p.client_id, "project_completed", `Project completed: ${p.title}`, p.visible_to_client);
  revalidatePath(`/clients/${str(form, "client_id")}`);
}

export async function addMilestoneAction(form: FormData) {
  await requireStaff();
  const sb = await supabaseServer();
  const project_id = str(form, "project_id");
  const title = str(form, "title");
  if (!project_id || !title) return;
  const { count } = await sb.from("milestones").select("id", { count: "exact", head: true }).eq("project_id", project_id);
  const { error } = await sb.from("milestones").insert({ project_id, title, due_date: str(form, "due_date") || null, sort_order: (count ?? 0) + 1 });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
}

export async function toggleMilestoneAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const done = str(form, "done") === "true";
  const { data: m } = await sb.from("milestones").update({ done }).eq("id", str(form, "id")).select("title,project_id").single();
  if (m && done) {
    const { data: p } = await sb.from("projects").select("client_id,visible_to_client").eq("id", m.project_id).single();
    if (p) await logEvent(sb, me.id, p.client_id, "milestone_done", `Milestone reached: ${m.title}`, p.visible_to_client);
  }
  revalidatePath(`/clients/${str(form, "client_id")}`);
}

/* ------------------------------------------------------------------ documents & contracts */
const DOC_KINDS = ["contract", "proposal", "brief", "asset", "report", "other"];
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(-80) || "file";

// Step 1: after a permission check, hand the browser a one-time URL to upload straight to storage.
export async function prepareUploadAction(form: FormData): Promise<{ path?: string; token?: string; error?: string }> {
  try {
    const me = await requireStaff();
    const client_id = str(form, "client_id");
    const kind = str(form, "kind");
    const file_name = str(form, "file_name");
    if (!client_id || !file_name) return { error: "Choose a file first" };
    if (!DOC_KINDS.includes(kind)) return { error: "Pick a document type" };
    if (kind === "contract" && !isLeadRole(me.role)) return { error: "Only a manager or admin can upload contracts" };
    // Staff must be able to see the client (row-level security decides)
    const sb = await supabaseServer();
    const { data: c } = await sb.from("clients").select("id").eq("id", client_id).single();
    if (!c) return { error: "Client not found" };
    const path = `${client_id}/${randomUUID()}-${safeName(file_name)}`;
    const { data, error } = await supabaseAdmin().storage.from("documents").createSignedUploadUrl(path);
    if (error || !data) return { error: "Storage isn't ready yet. Check the Supabase secret key is set in Vercel." };
    return { path, token: data.token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start the upload" };
  }
}

// Step 2: record the uploaded file. The path must live inside this client's folder.
export async function registerDocumentAction(form: FormData): Promise<{ error?: string }> {
  try {
    const me = await requireStaff();
    const sb = await supabaseServer();
    const client_id = str(form, "client_id");
    const path = str(form, "path");
    const kind = str(form, "kind");
    if (!path.startsWith(`${client_id}/`) || path.includes("..")) return { error: "Invalid file location" };
    if (!DOC_KINDS.includes(kind)) return { error: "Pick a document type" };
    const visible = form.get("visible") === "on";
    const isContract = kind === "contract";
    const { error } = await sb.from("documents").insert({
      client_id,
      project_id: str(form, "project_id") || null,
      kind,
      title: str(form, "title") || str(form, "file_name"),
      storage_path: path,
      file_name: str(form, "file_name"),
      mime_type: str(form, "mime_type") || null,
      size_bytes: Number(str(form, "size")) || null,
      status: isContract ? (visible ? "sent" : "draft") : "draft",
      visible_to_client: visible,
      created_by: me.id,
    });
    if (error) return { error: error.message };
    if (visible) await logEvent(sb, me.id, client_id, "document_shared", `${isContract ? "Contract" : "Document"} shared: ${str(form, "title") || str(form, "file_name")}`, true);
    revalidatePath(`/clients/${client_id}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the document" };
  }
}

export async function setDocumentSharingAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const client_id = str(form, "client_id");
  const share = str(form, "share") === "true";
  const { data: d } = await sb.from("documents").select("kind,status,title").eq("id", id).single();
  if (!d || d.status === "signed") return; // a signed contract is final
  const patch: Record<string, unknown> = { visible_to_client: share };
  if (d.kind === "contract") patch.status = share ? "sent" : "draft";
  const { error } = await sb.from("documents").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  if (share) await logEvent(sb, me.id, client_id, "document_shared", `${d.kind === "contract" ? "Contract" : "Document"} shared: ${d.title}`, true);
  revalidatePath(`/clients/${client_id}`);
}

export async function deleteDocumentAction(form: FormData) {
  await requireStaff();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: d } = await sb.from("documents").select("storage_path,client_id,status").eq("id", id).single();
  if (!d || d.status === "signed") throw new Error("A signed contract can't be deleted");
  const { error } = await sb.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabaseAdmin().storage.from("documents").remove([d.storage_path]);
  revalidatePath(`/clients/${d.client_id}`);
}

// A client accepts a contract. The database function checks everything again.
export async function signDocumentAction(form: FormData) {
  const me = await requireActive();
  if (me.role !== "client") throw new Error("Only the client can accept a contract");
  if (form.get("agree") !== "on") throw new Error("Please tick the box to confirm you agree");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("sign_document", { doc: str(form, "id"), signer: str(form, "signer") });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/* ------------------------------------------------------------------ chat */
export async function sendMessageAction(form: FormData): Promise<{ error?: string }> {
  try {
    const me = await requireActive();
    const body = str(form, "body").slice(0, 4000);
    if (!body) return {};
    const client_id = str(form, "client_id") || null;
    // Clients can only ever write to their own thread; the database enforces it too.
    const target = me.role === "client" ? me.client_id : client_id;
    if (me.role === "client" && !target) return { error: "Your account isn't linked to a client yet" };
    const sb = await supabaseServer();
    const { error } = await sb.from("messages").insert({ client_id: target, sender_id: me.id, body });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Message not sent" };
  }
}

/* ------------------------------------------------------------------ social posts */
export async function addPostAction(form: FormData) {
  const me = await requireStaff();
  if (!canSocial(me)) throw new Error("You don't have permission to create social posts");
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

// Approve / reject: manager or admin only. Marking posted: anyone with social access.
// The database enforces the same rules, so this can't be bypassed.
export async function reviewPostAction(form: FormData) {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const decision = str(form, "decision"); // approve | reject | posted
  const id = str(form, "id");
  if (decision === "posted") {
    if (!canSocial(me)) throw new Error("You don't have permission to publish posts");
  } else if (!isLeadRole(me.role)) {
    throw new Error("Only a manager or admin can approve or reject posts");
  }
  const next = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : decision === "posted" ? "posted" : null;
  if (!next) return;
  const patch: Record<string, unknown> = { status: next };
  if (next === "approved") patch.approved_by = me.id;
  if (next === "posted") patch.posted_at = new Date().toISOString();
  const { data: p, error } = await sb.from("social_posts").update(patch).eq("id", id).select("client_id,kind,platform").single();
  if (error) throw new Error(error.message);
  if (p && next !== "rejected") {
    const text = next === "approved" ? `Approved: ${p.kind} for ${p.platform}` : `Published: ${p.kind} on ${p.platform}`;
    await logEvent(sb, me.id, p.client_id, next === "approved" ? "post_approved" : "post_published", text, true);
  }
  revalidatePath("/approvals");
  revalidatePath("/");
}

/* ------------------------------------------------------------------ billing (admin only) */
export async function addInvoiceAction(form: FormData) {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const amount = num(form, "amount");
  if (!client_id || !(amount > 0)) throw new Error("Enter an amount above zero");
  const period = str(form, "period_label") || new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  const draft = form.get("draft") === "on";
  const { data: client } = await sb.from("clients").select("currency").eq("id", client_id).single();
  const { error } = await sb.from("invoices").insert({
    client_id, period_label: period, amount, currency: cur(form, "currency", client?.currency ?? BASE_CURRENCY), status: draft ? "draft" : "due",
  });
  if (error) throw new Error(error.message);
  if (!draft) await logEvent(sb, me.id, client_id, "invoice_issued", `Invoice issued: ${period}`, true);
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/finance");
}

export async function markInvoicePaidAction(form: FormData) {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const { data: inv } = await sb
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) })
    .eq("id", str(form, "id"))
    .select("period_label,client_id")
    .single();
  if (inv) await logEvent(sb, me.id, inv.client_id, "invoice_paid", `Payment received: ${inv.period_label}`, true);
  revalidatePath(`/clients/${inv?.client_id}`);
  revalidatePath("/finance");
}

export async function sendDraftInvoiceAction(form: FormData) {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const { data: inv } = await sb.from("invoices").update({ status: "due" }).eq("id", str(form, "id")).eq("status", "draft").select("period_label,client_id").single();
  if (inv) await logEvent(sb, me.id, inv.client_id, "invoice_issued", `Invoice issued: ${inv.period_label}`, true);
  revalidatePath(`/clients/${inv?.client_id}`);
  revalidatePath("/finance");
}

/* ------------------------------------------------------------------ finance: expenses & payroll (admin only) */
export async function addExpenseAction(form: FormData) {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const title = str(form, "title");
  const amount = num(form, "amount");
  if (!title || !(amount > 0)) throw new Error("Enter what it was for and an amount");
  const { error } = await sb.from("expenses").insert({
    title, amount, category: str(form, "category") || "other", currency: cur(form, "currency"),
    incurred_on: str(form, "incurred_on") || new Date().toISOString().slice(0, 10), created_by: me.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/finance");
}

export async function addPayRecordAction(form: FormData) {
  await requireAdmin();
  const sb = await supabaseServer();
  const staff_id = str(form, "staff_id");
  const amount = num(form, "amount");
  if (!staff_id || !(amount > 0)) throw new Error("Pick a team member and enter an amount");
  const { data: person } = await sb.from("profiles").select("pay_currency").eq("id", staff_id).single();
  if (!person) throw new Error("Team member not found");
  const { error } = await sb.from("pay_records").insert({
    staff_id, amount,
    period_label: str(form, "period_label") || new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }),
    kind: ["salary", "commission", "bonus", "reimbursement"].includes(str(form, "kind")) ? str(form, "kind") : "salary",
    currency: cur(form, "currency", person.pay_currency),
    note: str(form, "note") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/finance");
  revalidatePath("/pay");
}

export async function markPayPaidAction(form: FormData) {
  await requireAdmin();
  const sb = await supabaseServer();
  await sb.from("pay_records").update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) }).eq("id", str(form, "id"));
  revalidatePath("/finance");
  revalidatePath("/pay");
}

/* ------------------------------------------------------------------ team & logins (admin only) */
export async function createLoginAction(form: FormData) {
  await requireAdmin();
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const full_name = str(form, "full_name");
  const role = str(form, "role") as Role;
  const client_id = str(form, "client_id") || null;
  const can_manage_social = form.get("can_manage_social") === "on";

  if (!email || password.length < 10) throw new Error("Email and a password of 10+ characters are required");
  if (![...STAFF_ROLES, "client"].includes(role)) throw new Error("Bad role");
  if (role === "client" && !client_id) throw new Error("Pick the client this login belongs to");

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create user");

  const { error: pErr } = await admin
    .from("profiles")
    .update({
      full_name, role, status: "active",
      client_id: role === "client" ? client_id : null,
      can_manage_social: role === "developer" || role === "designer" || role === "marketing" ? can_manage_social : false,
      job_title: str(form, "job_title") || null,
      phone: str(form, "phone") || null,
      pay_currency: cur(form, "pay_currency"),
    })
    .eq("id", data.user.id);
  if (pErr) throw new Error(pErr.message);
  revalidatePath("/team");
}

export async function updateMemberAction(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "id");
  const role = str(form, "role") as Role;
  if (![...STAFF_ROLES].includes(role)) throw new Error("Bad role");
  if (id === me.id && role !== "admin") throw new Error("You can't remove your own admin access");
  const sb = await supabaseServer();
  const { error } = await sb
    .from("profiles")
    .update({
      role,
      job_title: str(form, "job_title") || null,
      pay_currency: cur(form, "pay_currency"),
      can_manage_social: form.get("can_manage_social") === "on",
    })
    .eq("id", id)
    .neq("role", "client");
  if (error) throw new Error(error.message);
  revalidatePath("/team");
}

export async function setAccountStatusAction(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "id");
  const status = str(form, "status");
  if (id === me.id) return; // never lock yourself out
  if (!["active", "disabled"].includes(status)) return;
  await supabaseAdmin().from("profiles").update({ status }).eq("id", id);
  revalidatePath("/team");
}

/* ------------------------------------------------------------------ account */
export async function updateOwnProfileAction(form: FormData) {
  const me = await requireActive();
  const sb = await supabaseServer();
  const full_name = str(form, "full_name");
  if (!full_name) throw new Error("Please enter your name");
  const { error } = await sb.from("profiles").update({ full_name, phone: str(form, "phone") || null }).eq("id", me.id);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
}

export async function signOutAction() {
  await (await supabaseServer()).auth.signOut();
  redirect("/login");
}
