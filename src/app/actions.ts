"use server";
import { STAGES, FOLLOW_UP_DAYS, dupeKeys, isStage, opportunityScore } from "@/lib/sales";
import { mentionPeople } from "@/lib/chat";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { formatMoney } from "@/lib/currency";
import { pickAssignee } from "@/lib/automation";
import { PROVIDERS, descendantIds, detectProvider, isMissingTable, newToken, normalizeUrl } from "@/lib/files";
import { dueDateFor } from "@/lib/recurrence";
import { adminIds, clientUserIds, leadIds, notifyUsers, snip, staffIds } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMe, supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { STAFF_ROLES, isAdminRole, isLeadRole, type Role } from "@/lib/roles";
import { BASE_CURRENCY, CURRENCIES, currencyForCountry, isCurrency } from "@/lib/currency";
import { addDays, isoDay, lateInterest, effectiveDueDate, percentsAddUp, splitAmounts } from "@/lib/payments";

/* ------------------------------------------------------------------ guards */
// Server-action errors thrown in production are masked by Next, so validation messages never reach the user.
// Wrapped actions catch them and return { error } instead; <Form> shows it as a toast.
function safe<A extends unknown[]>(fn: (...a: A) => Promise<void>) {
  return async (...a: A): Promise<{ error?: string } | undefined> => {
    try {
      await fn(...a);
    } catch (e) {
      const d = (e as { digest?: unknown })?.digest;
      if (typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK"))) throw e;
      return { error: e instanceof Error ? e.message : "Something went wrong" };
    }
  };
}

// Run after the response is sent, so notifications never slow an action down or make it fail.
function later(fn: () => Promise<void>) {
  const run = async () => { try { await fn(); } catch (e) { console.error("notification failed", e); } };
  try { after(run); } catch { void run(); }
}
const who = (me: { full_name: string | null; email: string | null }) => me.full_name || me.email || "Someone";

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
export const createClientAction = safe(async (form: FormData) => {
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
});

export const updateClientAction = safe(async (form: FormData) => {
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
      address: str(form, "address") || null,
      tax_id: str(form, "tax_id") || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/");
});

export const setClientStatusAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const status = str(form, "status") === "archived" ? "archived" : "active";
  { const { error: e1 } = await sb.from("clients").update({ status }).eq("id", id); if (e1) throw new Error(e1.message); }
  revalidatePath(`/clients/${id}`);
  revalidatePath("/");
});

/* ------------------------------------------------------------------ services on a client */
export const assignServiceAction = safe(async (form: FormData) => {
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
});

export const removeServiceAction = safe(async (form: FormData) => {
  const me = await requireLead();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  { const { error: e2 } = await sb.from("client_services").update({ status: "cancelled" }).eq("id", str(form, "id")); if (e2) throw new Error(e2.message); }
  await logEvent(sb, me.id, client_id, "service_cancelled", "A service was cancelled", false);
  revalidatePath(`/clients/${client_id}`);
});

/* ------------------------------------------------------------------ catalogue */
export const createServiceAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  const name = str(form, "name");
  if (!name) return;
  const { count } = await sb.from("services").select("id", { count: "exact", head: true });
  const { error } = await sb.from("services").insert({ name, description: str(form, "description") || null, sort_order: (count ?? 0) + 1 });
  if (error) throw new Error(error.message.includes("duplicate") ? "A service with that name already exists" : error.message);
  revalidatePath("/catalogue");
});
export const toggleServiceAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  { const { error: e3 } = await sb.from("services").update({ active: str(form, "active") === "true" }).eq("id", str(form, "id")); if (e3) throw new Error(e3.message); }
  revalidatePath("/catalogue");
});
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

export const createPackageAction = safe(async (form: FormData) => {
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
});

export const updatePackageAction = safe(async (form: FormData) => {
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
});
export const togglePackageAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  { const { error: e4 } = await sb.from("packages").update({ active: str(form, "active") === "true" }).eq("id", str(form, "id")); if (e4) throw new Error(e4.message); }
  revalidatePath("/catalogue");
});

/* ------------------------------------------------------------------ work / tasks */
export const addWorkAction = safe(async (form: FormData) => {
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
  const assignee = str(form, "assignee");
  if (assignee) later(() => notifyUsers([assignee], { title: "New task for you", body: snip(title), url: "/tasks" }, me.id));
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/tasks");
});

export const setWorkStatusAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const status = str(form, "status");
  const id = str(form, "id");
  const client_id = str(form, "client_id");
  if (!["todo", "in_progress", "review", "done"].includes(status)) return;
  const patch: { status: string; assignee?: string | null } = { status };
  let newAssignee: string | null = null;
  if (form.has("assignee")) {
    patch.assignee = str(form, "assignee") || null;
    const { data: before } = await sb.from("work_items").select("assignee").eq("id", id).single();
    if (patch.assignee && patch.assignee !== before?.assignee) newAssignee = patch.assignee;
  }
  const { data: w, error } = await sb.from("work_items").update(patch).eq("id", id).select("title,visible_to_client,client_id").single();
  if (error || !w) throw new Error(error?.message ?? "Could not change the task status");
  if (newAssignee) { const to = newAssignee; later(() => notifyUsers([to], { title: "A task was assigned to you", body: snip(w.title), url: "/tasks" }, me.id)); }
  if (w && status === "done") {
    await logEvent(sb, me.id, w.client_id, "work_done", `Completed: ${w.title}`, w.visible_to_client);
  }
  revalidatePath(`/clients/${client_id || w?.client_id}`);
  revalidatePath("/tasks");
});

/* ------------------------------------------------------------------ projects & milestones */
export const createProjectAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const title = str(form, "title");
  if (!client_id || !title) throw new Error("Give the project a title");
  const { data: proj, error } = await sb.from("projects").insert({
    client_id,
    title,
    description: str(form, "description") || null,
    start_date: str(form, "start_date") || null,
    due_date: str(form, "due_date") || null,
    visible_to_client: form.get("visible") === "on",
    created_by: me.id,
  }).select("id").single();
  if (error || !proj) throw new Error(error?.message ?? "Could not create the project");
  if (form.get("visible") === "on") await logEvent(sb, me.id, client_id, "project_created", `New project: ${title}`, true);

  // Optional price (admin only): saved as a payment plan with an advance now and the rest on delivery.
  const price = num(form, "price");
  if (price > 0) {
    if (!isAdminRole(me.role)) throw new Error("Project created, but only the admin can set its price");
    const adv = Math.min(100, Math.max(0, Number(str(form, "advance") || 50)));
    const parts = adv >= 100 ? [{ label: "Full payment", percent: 100, due: isoDay() }]
      : adv <= 0 ? [{ label: "Payment on delivery", percent: 100, due: null as string | null }]
      : [{ label: "Advance", percent: adv, due: isoDay() as string | null }, { label: "Final (on delivery)", percent: 100 - adv, due: null as string | null }];
    const amounts = splitAmounts(price, parts.map((x) => x.percent));
    const { data: plan, error: pErr } = await sb.from("payment_plans").insert({ client_id, project_id: proj.id, title, kind: "one_time", currency: cur(form, "currency"), total_amount: price, created_by: me.id }).select("id").single();
    if (pErr || !plan) throw new Error(`Project created, but its price could not be saved: ${pErr?.message}`);
    const { error: iErr } = await sb.from("plan_installments").insert(parts.map((x, n) => ({ plan_id: plan.id, label: x.label, percent: x.percent, amount: amounts[n], due_date: x.due, sort_order: n + 1 })));
    if (iErr) { await sb.from("payment_plans").delete().eq("id", plan.id); throw new Error(`Project created, but its price could not be saved: ${iErr.message}`); }
    await logEvent(sb, me.id, client_id, "plan_created", `Payment plan agreed: ${title}`, true);
    await sb.rpc("run_billing", { p_include_manual: false });
    revalidatePath("/finance"); revalidatePath("/transactions");
  }
  revalidatePath(`/clients/${client_id}`);
});

// When a project is delivered, invoice the payments that were waiting for delivery (the ones with no date).
async function invoiceOnDelivery(sb: Sb, projectId: string, isAdmin: boolean) {
  const { data: plans } = await sb.from("payment_plans").select("id,plan_installments(id,invoice_id,due_date)").eq("project_id", projectId).eq("status", "active");
  const ids = (plans ?? []).flatMap((p: any) => (p.plan_installments ?? []).filter((i: any) => !i.invoice_id && !i.due_date).map((i: any) => i.id as string));
  if (ids.length === 0) return;
  let client: Sb | ReturnType<typeof supabaseAdmin> = sb;
  if (!isAdmin) { try { client = supabaseAdmin(); } catch { return; } }
  for (const id of ids) await client.rpc("invoice_installment", { p_inst: id });
}

export const setProjectStatusAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const status = str(form, "status");
  if (!["planning", "in_progress", "review", "completed", "on_hold"].includes(status)) return;
  const { data: p, error } = await sb.from("projects").update({ status }).eq("id", str(form, "id")).select("client_id,title,visible_to_client").single();
  if (error || !p) throw new Error(error?.message ?? "Could not change the project status");
  if (status === "completed") {
    await invoiceOnDelivery(sb, str(form, "id"), isAdminRole(me.role));
    if (p.visible_to_client) later(async () => notifyUsers(await clientUserIds(p.client_id), { title: "Project completed", body: p.title, url: "/" }));
  }
  if (p && status === "completed") await logEvent(sb, me.id, p.client_id, "project_completed", `Project completed: ${p.title}`, p.visible_to_client);
  revalidatePath(`/clients/${str(form, "client_id")}`);
  revalidatePath("/");
});

export const addMilestoneAction = safe(async (form: FormData) => {
  await requireStaff();
  const sb = await supabaseServer();
  const project_id = str(form, "project_id");
  const title = str(form, "title");
  if (!project_id || !title) return;
  const { count } = await sb.from("milestones").select("id", { count: "exact", head: true }).eq("project_id", project_id);
  const { error } = await sb.from("milestones").insert({ project_id, title, due_date: str(form, "due_date") || null, sort_order: (count ?? 0) + 1 });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
});

export const toggleMilestoneAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const done = str(form, "done") === "true";
  const { data: m } = await sb.from("milestones").update({ done }).eq("id", str(form, "id")).select("title,project_id").single();
  if (m && done) {
    const { data: p } = await sb.from("projects").select("client_id,visible_to_client").eq("id", m.project_id).single();
    if (p) await logEvent(sb, me.id, p.client_id, "milestone_done", `Milestone reached: ${m.title}`, p.visible_to_client);
  }
  revalidatePath(`/clients/${str(form, "client_id")}`);
});

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
    if (visible) {
      await logEvent(sb, me.id, client_id, "document_shared", `${isContract ? "Contract" : "Document"} shared: ${str(form, "title") || str(form, "file_name")}`, true);
      later(async () => notifyUsers(await clientUserIds(client_id), { title: isContract ? "A contract is ready to sign" : "New document shared with you", body: snip(str(form, "title") || str(form, "file_name")), url: "/" }, me.id));
    }
    revalidatePath(`/clients/${client_id}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the document" };
  }
}

export const setDocumentSharingAction = safe(async (form: FormData) => {
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
});

export const deleteDocumentAction = safe(async (form: FormData) => {
  await requireStaff();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: d } = await sb.from("documents").select("storage_path,client_id,status").eq("id", id).single();
  if (!d || d.status === "signed") throw new Error("A signed contract can't be deleted");
  const { error } = await sb.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabaseAdmin().storage.from("documents").remove([d.storage_path]);
  revalidatePath(`/clients/${d.client_id}`);
});

// A client accepts a contract. The database function checks everything again.
export const signDocumentAction = safe(async (form: FormData) => {
  const me = await requireActive();
  if (me.role !== "client") throw new Error("Only the client can accept a contract");
  if (form.get("agree") !== "on") throw new Error("Please tick the box to confirm you agree");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("sign_document", { doc: str(form, "id"), signer: str(form, "signer") });
  if (error) throw new Error(error.message);
  revalidatePath("/");
});

/* ------------------------------------------------------------------ chat */
export async function sendMessageAction(form: FormData): Promise<{ error?: string }> {
  try {
    const me = await requireActive();
    const body = str(form, "body").slice(0, 4000);
    if (!body) return {};
    const client_id = str(form, "client_id") || null;
    const recipient = str(form, "recipient_id") || null;
    // Clients can only ever write to their own thread; the database enforces it too.
    const target = me.role === "client" ? me.client_id : recipient ? null : client_id;
    if (me.role === "client" && !target) return { error: "Your account isn't linked to a client yet" };
    if (recipient && me.role === "client") return { error: "Direct messages are for the team" };
    if (recipient === me.id) return { error: "You can't message yourself" };

    // Mentions: keep only people who are allowed to be mentioned in this chat (never trust the browser).
    let wanted: string[] = [];
    try { wanted = JSON.parse(str(form, "mentions") || "[]"); } catch {}
    const allowed = new Set((recipient ? [] : (await mentionPeople(me, target)).map((p) => p.id)));
    const mentions = [...new Set(wanted.filter((x) => typeof x === "string" && allowed.has(x)))].slice(0, 20);

    const sb = await supabaseServer();
    const { error } = await sb.from("messages").insert({ client_id: target, recipient_id: recipient, sender_id: me.id, body, mentions });
    if (error) return { error: error.message };
    later(async () => {
      const mentioned = new Set(mentions);
      const url = recipient ? `/chat/dm/${me.id}` : !target ? "/chat/team" : `/chat/c/${target}`;
      // The mentioned person gets a priority notification, wherever they are allowed to read.
      if (mentioned.size) {
        await notifyUsers([...mentioned], { title: `${who(me)} mentioned you`, body: snip(body), url, priority: true }, me.id);
      }
      const skip = (ids: string[]) => ids.filter((i) => !mentioned.has(i));
      if (recipient) await notifyUsers([recipient], { title: `${who(me)}`, body: snip(body), url: `/chat/dm/${me.id}` }, me.id);
      else if (!target) await notifyUsers(skip(await staffIds()), { title: `${who(me)} in Team chat`, body: snip(body), url: "/chat/team" }, me.id);
      else if (me.role === "client") await notifyUsers(skip(await leadIds()), { title: `${who(me)} (client)`, body: snip(body), url: `/chat/c/${target}` }, me.id);
      else await notifyUsers(skip(await clientUserIds(target)), { title: "Message from the Anweo team", body: snip(body), url: `/chat/c/${target}` }, me.id);
    });
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Message not sent" };
  }
}

/* ------------------------------------------------------------------ social posts */
export const addPostAction = safe(async (form: FormData) => {
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
  later(async () => notifyUsers(await leadIds(), { title: "Content waiting for approval", body: `${who(me)} submitted a ${str(form, "kind") || "post"}`, url: "/approvals" }, me.id));
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/approvals");
});

// Approve / reject: manager or admin only. Marking posted: anyone with social access.
// The database enforces the same rules, so this can't be bypassed.
export const reviewPostAction = safe(async (form: FormData) => {
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
  if (next === "rejected" && !str(form, "note")) throw new Error("Add a short note so the team knows what to change");
  const patch: Record<string, unknown> = { status: next };
  if (next === "approved") patch.approved_by = me.id;
  if (next === "approved" || next === "rejected") { patch.reviewed_by = me.id; patch.reviewed_at = new Date().toISOString(); patch.review_note = str(form, "note") || null; }
  if (next === "posted") { patch.posted_at = new Date().toISOString(); const u = str(form, "post_url"); if (/^https?:\/\//i.test(u)) patch.post_url = u.slice(0, 400); }
  const { data: p, error } = await sb.from("social_posts").update(patch).eq("id", id).select("client_id,kind,platform,title,caption,created_by").single();
  if (error) throw new Error(error.message);
  if (p) {
    const label = snip(p.title || p.caption || `${p.kind} for ${p.platform}`, 70);
    const note = str(form, "note");
    if (next === "approved") later(async () => {
      // The system hands out the "publish it" job: to the least busy person on the social team.
      const who2 = (await pickAssignee(["social_manager", "marketing", "designer"])) ?? p.created_by;
      const { data: when } = await supabaseAdmin().from("social_posts").select("scheduled_at").eq("id", id).single();
      await supabaseAdmin().from("work_items").insert({ client_id: p.client_id, title: `Publish: ${label}`, assignee: who2, due_date: (when?.scheduled_at ?? new Date(Date.now() + 86_400_000).toISOString()).slice(0, 10), visible_to_client: false, auto_created: true });
      await notifyUsers([who2], { title: "New task: publish approved content", body: label, url: "/tasks" }, me.id);
      await notifyUsers([p.created_by], { title: "Your content was approved", body: label, url: `/studio/${id}` }, me.id);
      await notifyUsers(await clientUserIds(p.client_id), { title: "New content is ready for you", body: label, url: "/" });
    });
    if (next === "rejected") later(() => notifyUsers([p.created_by], { title: "Changes requested", body: note ? snip(`${label}: ${note}`) : label, url: `/studio/${id}` }, me.id));
  }
  if (p && next !== "rejected") {
    const text = next === "approved" ? `Approved: ${p.kind} for ${p.platform}` : `Published: ${p.kind} on ${p.platform}`;
    await logEvent(sb, me.id, p.client_id, next === "approved" ? "post_approved" : "post_published", text, true);
  }
  revalidatePath("/approvals");
  revalidatePath("/");
});

/* ------------------------------------------------------------------ billing (admin only) */
export const addInvoiceAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const amount = num(form, "amount");
  if (!client_id || !(amount > 0)) throw new Error("Enter an amount above zero");
  const period = str(form, "period_label") || new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  const draft = form.get("draft") === "on";
  const { data: client } = await sb.from("clients").select("currency,payment_terms_days").eq("id", client_id).single();
  const due = /^\d{4}-\d{2}-\d{2}$/.test(str(form, "due_date")) ? str(form, "due_date") : addDays(isoDay(), client?.payment_terms_days ?? 7);
  const { error } = await sb.from("invoices").insert({
    client_id, period_label: period, amount, currency: cur(form, "currency", client?.currency ?? BASE_CURRENCY),
    status: draft ? "draft" : "due", due_date: due,
  });
  if (error) throw new Error(error.message);
  if (!draft) await logEvent(sb, me.id, client_id, "invoice_issued", `Invoice issued: ${period}`, true);
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

export const markInvoicePaidAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const { data: inv } = await sb
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) })
    .eq("id", str(form, "id"))
    .select("period_label,client_id")
    .single();
  if (!inv) throw new Error("That invoice could not be found");
  await logEvent(sb, me.id, inv.client_id, "invoice_paid", `Payment received: ${inv.period_label}`, true);
  later(async () => notifyUsers(await clientUserIds(inv.client_id), { title: "Payment received, thank you", body: inv.period_label, url: "/" }));
  revalidatePath(`/clients/${inv?.client_id}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

export const sendDraftInvoiceAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const { data: draftInv } = await sb.from("invoices").select("client_id,clients(payment_terms_days)").eq("id", str(form, "id")).eq("status", "draft").single();
  const terms = (draftInv?.clients as unknown as { payment_terms_days: number } | null)?.payment_terms_days ?? 7;
  const { data: inv } = await sb.from("invoices").update({ status: "due", issued_at: isoDay(), due_date: addDays(isoDay(), terms) }).eq("id", str(form, "id")).eq("status", "draft").select("period_label,client_id").single();
  if (inv) {
    await logEvent(sb, me.id, inv.client_id, "invoice_issued", `Invoice issued: ${inv.period_label}`, true);
    later(async () => notifyUsers(await clientUserIds(inv.client_id), { title: "New invoice", body: inv.period_label, url: "/" }));
  }
  revalidatePath(`/clients/${inv?.client_id}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

/* ------------------------------------------------------------------ finance: expenses & payroll (admin only) */
export const addExpenseAction = safe(async (form: FormData) => {
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
  revalidatePath("/finance"); revalidatePath("/transactions");
});

export const addPayRecordAction = safe(async (form: FormData) => {
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
  revalidatePath("/finance"); revalidatePath("/transactions");
  revalidatePath("/pay");
});

export const markPayPaidAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  { const { error: e5 } = await sb.from("pay_records").update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) }).eq("id", str(form, "id")); if (e5) throw new Error(e5.message); }
  revalidatePath("/finance"); revalidatePath("/transactions");
  revalidatePath("/pay");
});

/* ------------------------------------------------------------------ team & logins (admin only) */
export const createLoginAction = safe(async (form: FormData) => {
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
});

export const updateMemberAction = safe(async (form: FormData) => {
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
});

export const setAccountStatusAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const id = str(form, "id");
  const status = str(form, "status");
  if (id === me.id) return; // never lock yourself out
  if (!["active", "disabled"].includes(status)) return;
  await supabaseAdmin().from("profiles").update({ status }).eq("id", id);
  revalidatePath("/team");
});

/* ------------------------------------------------------------------ payment terms & plans (admin only) */
const intIn = (f: FormData, k: string, min: number, max: number, fallback: number) => {
  const raw = str(f, k);
  if (raw === "") return fallback;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`Enter a whole number from ${min} to ${max}`);
  return v;
};

export const savePaymentTermsAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const pct = str(form, "late_interest_percent") === "" ? 0 : Number(str(form, "late_interest_percent"));
  if (!(pct >= 0 && pct <= 50)) throw new Error("Late fee must be between 0 and 50 percent a week");
  const { error } = await sb.from("clients").update({
    payment_terms_days: intIn(form, "payment_terms_days", 0, 180, 7),
    late_grace_days: intIn(form, "late_grace_days", 0, 90, 0),
    late_interest_percent: pct,
  }).eq("id", client_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${client_id}`);
});

// One-time payment, split into up to four instalments (for example 50% advance + 50% final).
export const createOneTimePlanAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const title = str(form, "title");
  const total = num(form, "total");
  if (!client_id || !title) throw new Error("Give the payment a name");
  if (!(total > 0)) throw new Error("Enter the total amount");

  const rows: { label: string; percent: number; due: string | null }[] = [];
  for (let i = 1; i <= 4; i++) {
    const pctRaw = str(form, `percent_${i}`);
    if (pctRaw === "") continue;
    const percent = Number(pctRaw);
    if (!(percent > 0 && percent <= 100)) throw new Error(`Instalment ${i}: the percentage must be between 0 and 100`);
    const due = str(form, `due_${i}`);
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error(`Instalment ${i}: that date isn't valid`);
    rows.push({ label: str(form, `label_${i}`) || `Payment ${i}`, percent, due: due || null });
  }
  if (rows.length === 0) throw new Error("Add at least one instalment");
  if (!percentsAddUp(rows.map((r) => r.percent))) throw new Error("The percentages must add up to exactly 100");

  const currency = cur(form, "currency");
  const amounts = splitAmounts(total, rows.map((r) => r.percent));
  const { data: plan, error } = await sb.from("payment_plans").insert({
    client_id, title, kind: "one_time", currency, total_amount: total, notes: str(form, "notes") || null, created_by: me.id,
  }).select("id").single();
  if (error) throw new Error(error.message);

  const { error: iErr } = await sb.from("plan_installments").insert(
    rows.map((r, idx) => ({ plan_id: plan.id, label: r.label, percent: r.percent, amount: amounts[idx], due_date: r.due, sort_order: idx + 1 }))
  );
  if (iErr) {
    await sb.from("payment_plans").delete().eq("id", plan.id); // never leave a plan without its schedule
    throw new Error(iErr.message);
  }
  await logEvent(sb, me.id, client_id, "plan_created", `Payment plan agreed: ${title}`, true);
  await sb.rpc("run_billing", { p_include_manual: false }); // issues anything already due, e.g. an advance due today
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

// Repeating payment: monthly, quarterly or yearly.
export const createRecurringPlanAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const title = str(form, "title");
  const amount = num(form, "amount");
  const interval = str(form, "billing_interval");
  const start = /^\d{4}-\d{2}-\d{2}$/.test(str(form, "start_date")) ? str(form, "start_date") : isoDay();
  const end = /^\d{4}-\d{2}-\d{2}$/.test(str(form, "end_date")) ? str(form, "end_date") : null;
  if (!client_id || !title) throw new Error("Give the payment a name");
  if (!(amount > 0)) throw new Error("Enter the amount per period");
  if (!["monthly", "quarterly", "yearly"].includes(interval)) throw new Error("Pick how often it repeats");
  if (end && end < start) throw new Error("The end date can't be before the start date");

  const { error } = await sb.from("payment_plans").insert({
    client_id, title, kind: "recurring", currency: cur(form, "currency"), recurring_amount: amount,
    billing_interval: interval, start_date: start, next_invoice_date: start, end_date: end,
    auto_invoice: form.get("auto_invoice") === "on", notes: str(form, "notes") || null, created_by: me.id,
  });
  if (error) throw new Error(error.message);
  await logEvent(sb, me.id, client_id, "plan_created", `Recurring payment agreed: ${title}`, true);
  await sb.rpc("run_billing", { p_include_manual: false });
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

export const invoiceInstallmentAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("invoice_installment", { p_inst: str(form, "id") });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

export const invoiceRecurringNowAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("invoice_recurring_now", { p_plan: str(form, "id") });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

export const setPlanStatusAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const status = str(form, "status");
  if (!["active", "paused", "cancelled"].includes(status)) return;
  const client_id = str(form, "client_id");
  const { data: plan } = await sb.from("payment_plans").update({ status }).eq("id", str(form, "id")).select("title").single();
  if (plan && status === "cancelled") await logEvent(sb, me.id, client_id, "plan_cancelled", `Payment plan ended: ${plan.title}`, true);
  revalidatePath(`/clients/${client_id}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

// "Create all invoices that are ready" (includes recurring plans that aren't set to run by themselves).
export const runBillingAction = safe(async () => {
  await requireAdmin();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("run_billing", { p_include_manual: true });
  if (error) throw new Error(error.message);
  revalidatePath("/finance"); revalidatePath("/transactions");
  revalidatePath("/");
});

// Charge the late interest that has built up on an overdue invoice, as its own invoice.
export const chargeLateInterestAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: inv } = await sb
    .from("invoices")
    .select("id,client_id,period_label,amount,currency,status,issued_at,due_date,late_fee_charged,clients(payment_terms_days,late_grace_days,late_interest_percent)")
    .eq("id", id).single();
  if (!inv || inv.status === "paid" || inv.status === "void" || inv.status === "draft") throw new Error("Interest can only be charged on an unpaid, issued invoice");
  const c = inv.clients as unknown as { payment_terms_days: number; late_grace_days: number; late_interest_percent: number };
  const accrued = lateInterest({
    amount: Number(inv.amount), due: effectiveDueDate(inv, c.payment_terms_days), today: isoDay(),
    graceDays: c.late_grace_days, percentPerWeek: Number(c.late_interest_percent),
  });
  const unbilled = Math.round((accrued - Number(inv.late_fee_charged)) * 100) / 100;
  if (!(unbilled >= 0.01)) throw new Error("There's no new late interest to charge on this invoice");
  const typed = str(form, "amount");
  const amount = typed === "" ? unbilled : Number(typed);
  if (!(amount > 0) || amount > unbilled + 0.005) throw new Error(`You can charge up to ${unbilled.toFixed(2)} right now`);

  const { error } = await sb.from("invoices").insert({
    client_id: inv.client_id, period_label: `Late payment interest: ${inv.period_label}`, amount, currency: inv.currency,
    status: "due", issued_at: isoDay(), due_date: addDays(isoDay(), c.payment_terms_days),
  });
  if (error) throw new Error(error.message);
  { const { error: e6 } = await sb.from("invoices").update({ late_fee_charged: Math.round((Number(inv.late_fee_charged) + amount) * 100) / 100 }).eq("id", id); if (e6) throw new Error(e6.message); }
  await logEvent(sb, me.id, inv.client_id, "late_interest", `Late payment interest charged on: ${inv.period_label}`, true);
  revalidatePath(`/clients/${inv.client_id}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

/* ------------------------------------------------------------------ account */
export const updateOwnProfileAction = safe(async (form: FormData) => {
  const me = await requireActive();
  const sb = await supabaseServer();
  const full_name = str(form, "full_name");
  if (!full_name) throw new Error("Please enter your name");
  const { error } = await sb.from("profiles").update({ full_name, phone: str(form, "phone") || null }).eq("id", me.id);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
});

export async function signOutAction() {
  await (await supabaseServer()).auth.signOut();
  redirect("/login");
}


/* ----------------------------------------------------------- company settings */
export const saveCompanySettingsAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const legal_name = str(form, "legal_name");
  if (!legal_name) throw new Error("Business name is required");
  if (str(form, "upi_id") && !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(str(form, "upi_id"))) throw new Error("That UPI ID doesn't look right. It should look like name@bank");
  const { error } = await sb.from("company_settings").upsert({
    id: 1,
    legal_name,
    address: str(form, "address") || null,
    email: str(form, "email") || null,
    phone: str(form, "phone") || null,
    website: str(form, "website") || null,
    tax_label: str(form, "tax_label") || "Tax ID",
    tax_number: str(form, "tax_number") || null,
    payment_details: str(form, "payment_details") || null,
    invoice_note: str(form, "invoice_note") || null,
    terms_conditions: str(form, "terms_conditions") || null,
    upi_id: str(form, "upi_id") || null,
    upi_name: str(form, "upi_name") || null,
    whatsapp_number: str(form, "whatsapp_number") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
});

/* ---------------------------------------------------- deleting transactions (admin only) */
export const deleteInvoiceAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: inv, error } = await sb.from("invoices").delete().eq("id", id).select("period_label,client_id,amount,currency,status").single();
  if (error || !inv) throw new Error(error?.message ?? "Could not delete that invoice");
  await logEvent(sb, me.id, inv.client_id, "invoice_deleted", `Deleted invoice: ${inv.period_label} (${inv.amount} ${inv.currency}, ${inv.status})`, false);
  revalidatePath(`/clients/${inv.client_id}`);
  revalidatePath("/finance"); revalidatePath("/transactions");
  revalidatePath("/");
});

export const deleteExpenseAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const { error } = await sb.from("expenses").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/finance"); revalidatePath("/transactions");
});

export const deletePayRecordAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const { error } = await sb.from("pay_records").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/finance"); revalidatePath("/transactions");
  revalidatePath("/pay");
});

/* ------------------------------------------------ editing transactions (admin only) */
const isoOrNull = (f: FormData, k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(f, k)) ? str(f, k) : null);
const backTo = (f: FormData) => {
  const b = str(f, "back");
  return b.startsWith("/transactions") ? b : "/transactions";
};

export const updateInvoiceAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const amount = num(form, "amount");
  const status = str(form, "status");
  if (!(amount >= 0)) throw new Error("Enter a valid amount");
  if (!["draft", "due", "overdue", "paid", "void"].includes(status)) throw new Error("Pick a status");
  const period_label = str(form, "period_label");
  if (!period_label) throw new Error("Enter a description");
  const paid_at = status === "paid" ? isoOrNull(form, "paid_at") ?? isoDay() : null;
  const { data: inv, error } = await sb.from("invoices").update({
    period_label, amount, currency: cur(form, "currency"), status, paid_at,
    issued_at: isoOrNull(form, "issued_at") ?? isoDay(), due_date: isoOrNull(form, "due_date"),
  }).eq("id", id).select("client_id").single();
  if (error || !inv) throw new Error(error?.message ?? "Could not save that invoice");
  await logEvent(sb, me.id, inv.client_id, "invoice_edited", `Edited invoice: ${period_label}`, false);
  revalidatePath("/transactions"); revalidatePath("/finance"); revalidatePath("/transactions"); revalidatePath(`/clients/${inv.client_id}`); revalidatePath("/");
  redirect(backTo(form));
});

export const updateExpenseAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const title = str(form, "title");
  const amount = num(form, "amount");
  if (!title || !(amount >= 0)) throw new Error("Enter what it was for and an amount");
  const { error } = await sb.from("expenses").update({
    title, amount, currency: cur(form, "currency"), category: str(form, "category") || "other",
    incurred_on: isoOrNull(form, "incurred_on") ?? isoDay(), note: str(form, "note") || null,
  }).eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/transactions"); revalidatePath("/finance"); revalidatePath("/transactions");
  redirect(backTo(form));
});

export const updatePayRecordAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const amount = num(form, "amount");
  const status = str(form, "status");
  if (!(amount >= 0)) throw new Error("Enter a valid amount");
  if (!["pending", "paid"].includes(status)) throw new Error("Pick a status");
  const { error } = await sb.from("pay_records").update({
    amount, currency: cur(form, "currency"), status,
    period_label: str(form, "period_label") || "Pay",
    kind: ["salary", "commission", "bonus", "reimbursement"].includes(str(form, "kind")) ? str(form, "kind") : "salary",
    paid_at: status === "paid" ? isoOrNull(form, "paid_at") ?? isoDay() : null, note: str(form, "note") || null,
  }).eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/transactions"); revalidatePath("/finance"); revalidatePath("/transactions"); revalidatePath("/pay");
  redirect(backTo(form));
});

/* ------------------------------------------------------------ editing projects */
export const updateProjectAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  const title = str(form, "title");
  if (!title) throw new Error("Give the project a title");
  const { error } = await sb.from("projects").update({
    title, description: str(form, "description") || null,
    start_date: str(form, "start_date") || null, due_date: str(form, "due_date") || null,
    visible_to_client: form.get("visible") === "on",
  }).eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
  revalidatePath("/");
});

export const deleteProjectAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  const { error } = await sb.from("projects").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
  revalidatePath("/");
});

export const deleteMilestoneAction = safe(async (form: FormData) => {
  await requireStaff();
  const sb = await supabaseServer();
  const { error } = await sb.from("milestones").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
});

/* ------------------------------------------------------------ notifications */
export const savePushSubscriptionAction = safe(async (form: FormData) => {
  const me = await requireActive();
  const endpoint = str(form, "endpoint");
  const p256dh = str(form, "p256dh");
  const auth = str(form, "auth");
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new Error("That device could not be registered");
  const admin = supabaseAdmin();
  // A device belongs to whoever is signed in on it now.
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await admin.from("push_subscriptions").insert({ user_id: me.id, kind: "web", endpoint, keys: { p256dh, auth }, user_agent: str(form, "ua") || null });
  if (error) throw new Error(error.message);
});

export const removePushSubscriptionAction = safe(async (form: FormData) => {
  const me = await requireActive();
  await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", str(form, "endpoint")).eq("user_id", me.id);
});

export const markNotificationsReadAction = safe(async () => {
  await requireActive();
  const sb = await supabaseServer();
  const { error } = await sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
});

/* ------------------------------------------------------------ clock in / out */
export const clockInAction = safe(async () => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const { error } = await sb.from("time_entries").insert({ user_id: me.id });
  if (error) throw new Error(error.code === "23505" ? "You're already clocked in" : error.message);
  revalidatePath("/clock");
});

export const clockOutAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const endedRaw = str(form, "ended_at");
  const ended = endedRaw ? new Date(endedRaw) : new Date();
  if (Number.isNaN(ended.getTime())) throw new Error("That finish time isn't valid");
  const { data, error } = await sb.from("time_entries").update({ clock_out: ended.toISOString(), note: str(form, "note").slice(0, 300) || null }).eq("user_id", me.id).is("clock_out", null).select("id");
  if (error) throw new Error(error.message.includes("check") ? "The finish time must be after you clocked in" : error.message);
  if (!data?.length) throw new Error("You're not clocked in");
  revalidatePath("/clock");
});

export const deleteTimeEntryAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const { error } = await sb.from("time_entries").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/clock");
});

/* ------------------------------------------------------------ social studio */
const POST_KINDS = ["post", "reel", "story", "carousel"];
const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/quicktime"];

function requireSocial(me: Awaited<ReturnType<typeof requireStaff>>) {
  if (!canSocial(me)) throw new Error("You don't have permission to work on social content");
}
const isoDateTime = (f: FormData, k: string) => { const v = str(f, k); const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

// Create or update a post. New posts start as an idea (or straight as a draft).
export const savePostAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const id = str(form, "id");
  const kind = POST_KINDS.includes(str(form, "kind")) ? str(form, "kind") : "post";
  const fields = {
    title: str(form, "title").slice(0, 140) || null,
    caption: str(form, "caption").slice(0, 2200) || null,
    hashtags: str(form, "hashtags").slice(0, 500) || null,
    notes: str(form, "notes").slice(0, 3000) || null,
    kind,
    platform: str(form, "platform") || "instagram",
    scheduled_at: isoDateTime(form, "scheduled_at"),
  };
  if (id) {
    const { error } = await sb.from("social_posts").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath(`/studio/${id}`); revalidatePath("/studio"); revalidatePath("/approvals");
    return;
  }
  const client_id = str(form, "client_id");
  if (!client_id) throw new Error("Pick which client this is for");
  if (!fields.title && !fields.caption && !fields.notes) throw new Error("Give it a title or a few words about the idea");
  const { data, error } = await sb.from("social_posts").insert({ ...fields, client_id, status: str(form, "stage") === "draft" ? "in_progress" : "idea", created_by: me.id }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create it");
  revalidatePath("/studio");
  redirect(`/studio/${data.id}`);
});

// Move a post along the creator's side of the workflow. Approving is the manager's job (reviewPostAction).
export const setPostStageAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const id = str(form, "id");
  const to = str(form, "to");
  const { data: p } = await sb.from("social_posts").select("status,caption,title,kind,created_by").eq("id", id).single();
  if (!p) throw new Error("Post not found");
  const allowed: Record<string, string[]> = { idea: ["in_progress"], in_progress: ["idea", "awaiting_approval"], awaiting_approval: ["in_progress"], rejected: ["in_progress", "awaiting_approval"] };
  if (!(allowed[p.status] ?? []).includes(to)) throw new Error("That step isn't available right now");
  if (to === "awaiting_approval") {
    const { count } = await sb.from("post_media").select("id", { count: "exact", head: true }).eq("post_id", id);
    if (!p.caption && !count) throw new Error("Add a caption or upload your work before sending it for review");
  }
  const { error } = await sb.from("social_posts").update({ status: to }).eq("id", id);
  if (error) throw new Error(error.message);
  if (to === "awaiting_approval") later(async () => notifyUsers(await leadIds(), { title: "Content waiting for approval", body: snip(`${who(me)}: ${p.title || p.caption || p.kind}`), url: `/studio/${id}` }, me.id));
  revalidatePath(`/studio/${id}`); revalidatePath("/studio"); revalidatePath("/approvals");
});

export const deletePostAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: p } = await sb.from("social_posts").select("status").eq("id", id).single();
  if (!p) throw new Error("Post not found");
  if (["approved", "scheduled", "posted"].includes(p.status) && !isLeadRole(me.role)) throw new Error("Only a manager or admin can delete approved content");
  const { data: media } = await sb.from("post_media").select("storage_path").eq("post_id", id);
  const { error } = await sb.from("social_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (media?.length) { try { await supabaseAdmin().storage.from("documents").remove(media.map((m) => m.storage_path)); } catch { /* files can be cleaned up later */ } }
  revalidatePath("/studio");
  redirect("/studio");
});

export const addPostCommentAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const post_id = str(form, "post_id");
  const body = str(form, "body").slice(0, 2000);
  if (!body) return;
  const { data: p } = await sb.from("social_posts").select("created_by,title,caption").eq("id", post_id).single();
  const { error } = await sb.from("post_comments").insert({ post_id, author_id: me.id, body });
  if (error) throw new Error(error.message);
  if (p?.created_by) later(() => notifyUsers([p.created_by], { title: `${who(me)} commented on your content`, body: snip(body), url: `/studio/${post_id}` }, me.id));
  revalidatePath(`/studio/${post_id}`);
});

export async function preparePostMediaAction(form: FormData): Promise<{ path?: string; token?: string; error?: string }> {
  try {
    const me = await requireStaff();
    requireSocial(me);
    const post_id = str(form, "post_id");
    const file_name = str(form, "file_name");
    if (!post_id || !file_name) return { error: "Choose a file first" };
    const sb = await supabaseServer();
    const { data: p } = await sb.from("social_posts").select("id").eq("id", post_id).single();
    if (!p) return { error: "Post not found" };
    const path = `posts/${post_id}/${randomUUID()}-${safeName(file_name)}`;
    const { data, error } = await supabaseAdmin().storage.from("documents").createSignedUploadUrl(path);
    if (error || !data) return { error: "Storage isn't ready yet. Check the Supabase secret key is set in Vercel." };
    return { path, token: data.token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start the upload" };
  }
}

export async function registerPostMediaAction(form: FormData): Promise<{ error?: string }> {
  try {
    const me = await requireStaff();
    requireSocial(me);
    const sb = await supabaseServer();
    const post_id = str(form, "post_id");
    const path = str(form, "path");
    const mime = str(form, "mime_type");
    if (!path.startsWith(`posts/${post_id}/`) || path.includes("..")) return { error: "Invalid file location" };
    if (!MEDIA_TYPES.includes(mime)) return { error: "Only images (PNG, JPG, WebP, GIF) and videos (MP4, MOV) can be added" };
    const { count } = await sb.from("post_media").select("id", { count: "exact", head: true }).eq("post_id", post_id);
    const { error } = await sb.from("post_media").insert({ post_id, storage_path: path, file_name: str(form, "file_name"), mime_type: mime, size_bytes: Number(str(form, "size")) || null, sort_order: (count ?? 0) + 1, created_by: me.id });
    if (error) return { error: error.message };
    revalidatePath(`/studio/${post_id}`); revalidatePath("/studio");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the file" };
  }
}

export const deletePostMediaAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const { data: m } = await sb.from("post_media").select("storage_path,post_id").eq("id", str(form, "id")).single();
  if (!m) throw new Error("File not found");
  const { error } = await sb.from("post_media").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  try { await supabaseAdmin().storage.from("documents").remove([m.storage_path]); } catch { /* ignore */ }
  revalidatePath(`/studio/${m.post_id}`); revalidatePath("/studio");
});

/* ------------------------------------------------------------ client payments */
// A client says they've paid. We can't verify a UPI or bank transfer from here, so this tells the admin to check and mark it paid.
export const reportPaymentAction = safe(async (form: FormData) => {
  const me = await requireActive();
  const id = str(form, "id");
  const sb = await supabaseServer();
  const { data: inv } = await sb.from("invoices").select("id,client_id,period_label,amount,currency,status,invoice_no,clients(business_name)").eq("id", id).single();
  if (!inv) throw new Error("Invoice not found");
  if (inv.status !== "due" && inv.status !== "overdue") throw new Error("This invoice isn't waiting for payment");
  const ref = str(form, "reference").slice(0, 80);
  const money = formatMoney(inv.amount, inv.currency);
  const clientName = (inv.clients as unknown as { business_name: string } | null)?.business_name ?? "A client";
  await logEvent(supabaseAdmin(), me.id, inv.client_id, "payment_reported", `${who(me)} says they paid ${money} for ${inv.period_label}${ref ? ` (ref ${ref})` : ""}`, false);
  later(async () => notifyUsers(await adminIds(), { title: "Client says they've paid", body: snip(`${clientName} · ${money} · ${inv.period_label}${ref ? ` · ref ${ref}` : ""}`), url: "/transactions?type=income&status=due" }, me.id));
  revalidatePath("/transactions");
});

/* ------------------------------------------------------------ support tickets */
const TICKET_CATEGORIES = ["support", "change_request", "new_service", "billing", "other"];
const TICKET_STATUSES = ["open", "in_progress", "waiting_client", "resolved", "closed"];
const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"];

export const createTicketAction = safe(async (form: FormData) => {
  const me = await requireActive();
  const sb = await supabaseServer();
  const isClient = me.role === "client";
  const client_id = isClient ? me.client_id : str(form, "client_id");
  if (!client_id) throw new Error(isClient ? "Your account isn't linked to a client yet" : "Pick the client this is for");
  const subject = str(form, "subject");
  const body = str(form, "body");
  if (subject.length < 3) throw new Error("Give the ticket a short title");
  if (!body) throw new Error("Describe what you need");
  const category = TICKET_CATEGORIES.includes(str(form, "category")) ? str(form, "category") : "support";
  const priority = isClient ? (form.get("urgent") === "on" ? "high" : "normal") : (TICKET_PRIORITIES.includes(str(form, "priority")) ? str(form, "priority") : "normal");
  const project_id = str(form, "project_id") || null;
  const { data: t, error } = await sb.from("tickets").insert({ client_id, project_id, subject: subject.slice(0, 140), category, priority, created_by: me.id }).select("id,ticket_no").single();
  if (error || !t) throw new Error(error?.message ?? "Could not create the ticket");
  const { error: mErr } = await sb.from("ticket_messages").insert({ ticket_id: t.id, author_id: me.id, body: body.slice(0, 4000) });
  if (mErr) throw new Error(mErr.message);
  const label = `#${String(t.ticket_no).padStart(4, "0")} ${subject}`;
  if (isClient) later(async () => notifyUsers(await leadIds(), { title: "New support ticket", body: snip(`${who(me)}: ${label}`), url: `/tickets/${t.id}` }, me.id));
  else later(async () => notifyUsers(await clientUserIds(client_id), { title: "We opened a ticket for you", body: snip(label), url: `/tickets/${t.id}` }, me.id));
  revalidatePath("/tickets");
  redirect(`/tickets/${t.id}`);
});

export const replyTicketAction = safe(async (form: FormData) => {
  const me = await requireActive();
  const sb = await supabaseServer();
  const ticket_id = str(form, "ticket_id");
  const body = str(form, "body").slice(0, 4000);
  if (!body) throw new Error("Write a reply first");
  const { data: t } = await sb.from("tickets").select("id,ticket_no,subject,client_id,status,assigned_to").eq("id", ticket_id).single();
  if (!t) throw new Error("Ticket not found");
  const isClient = me.role === "client";
  const internal = !isClient && form.get("internal") === "on";
  const { error } = await sb.from("ticket_messages").insert({ ticket_id, author_id: me.id, body, internal });
  if (error) throw new Error(error.message);
  const label = `#${String(t.ticket_no).padStart(4, "0")} ${t.subject}`;
  if (isClient) {
    if (t.status === "resolved" || t.status === "closed" || t.status === "waiting_client") await sb.from("tickets").update({ status: "open" }).eq("id", ticket_id);
    later(async () => notifyUsers([t.assigned_to, ...(t.assigned_to ? [] : await leadIds())], { title: "Client replied", body: snip(`${label}: ${body}`), url: `/tickets/${ticket_id}` }, me.id));
  } else if (!internal) {
    const after = str(form, "set_status");
    if (TICKET_STATUSES.includes(after) && after !== t.status) await sb.from("tickets").update({ status: after }).eq("id", ticket_id);
    later(async () => notifyUsers(await clientUserIds(t.client_id), { title: after === "resolved" ? "Your ticket was resolved" : "New reply on your ticket", body: snip(`${label}: ${body}`), url: `/tickets/${ticket_id}` }, me.id));
  }
  revalidatePath(`/tickets/${ticket_id}`); revalidatePath("/tickets");
});

// Staff: change status, priority or who is handling it.
export const updateTicketAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const status = str(form, "status");
  const priority = str(form, "priority");
  if (!TICKET_STATUSES.includes(status) || !TICKET_PRIORITIES.includes(priority)) throw new Error("Pick a valid status and priority");
  const assignee = str(form, "assigned_to") || null;
  const { data: before } = await sb.from("tickets").select("status,assigned_to,client_id,ticket_no,subject").eq("id", id).single();
  if (!before) throw new Error("Ticket not found");
  const { error } = await sb.from("tickets").update({ status, priority, assigned_to: assignee }).eq("id", id);
  if (error) throw new Error(error.message);
  const label = `#${String(before.ticket_no).padStart(4, "0")} ${before.subject}`;
  if (assignee && assignee !== before.assigned_to) later(() => notifyUsers([assignee], { title: "A ticket was assigned to you", body: snip(label), url: `/tickets/${id}` }, me.id));
  if (status !== before.status && (status === "resolved" || status === "in_progress")) later(async () => notifyUsers(await clientUserIds(before.client_id), { title: status === "resolved" ? "Your ticket was resolved" : "We're working on your ticket", body: snip(label), url: `/tickets/${id}` }, me.id));
  revalidatePath(`/tickets/${id}`); revalidatePath("/tickets");
});

// Client: close a ticket that's sorted, or reopen one that isn't.
export const clientTicketStatusAction = safe(async (form: FormData) => {
  const me = await requireActive();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const status = str(form, "status") === "closed" ? "closed" : "open";
  const { data: t, error } = await sb.from("tickets").update({ status }).eq("id", id).select("ticket_no,subject").single();
  if (error || !t) throw new Error(error?.message ?? "Ticket not found");
  if (me.role === "client" && status === "open") later(async () => notifyUsers(await leadIds(), { title: "A client reopened a ticket", body: snip(`#${String(t.ticket_no).padStart(4, "0")} ${t.subject}`), url: `/tickets/${id}` }, me.id));
  revalidatePath(`/tickets/${id}`); revalidatePath("/tickets");
});

export const deleteTicketAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const { error } = await sb.from("tickets").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/tickets");
  redirect("/tickets");
});

/* ------------------------------------------------------------ project updates */
export const postProjectUpdateAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const project_id = str(form, "project_id");
  const body = str(form, "body").slice(0, 2000);
  if (!body) throw new Error("Write the update first");
  const { data: p } = await sb.from("projects").select("title,client_id,visible_to_client").eq("id", project_id).single();
  if (!p) throw new Error("Project not found");
  const { error } = await sb.from("project_updates").insert({ project_id, author_id: me.id, body });
  if (error) throw new Error(error.message);
  if (p.visible_to_client) later(async () => notifyUsers(await clientUserIds(p.client_id), { title: `Update: ${p.title}`, body: snip(body), url: "/" }, me.id));
  revalidatePath(`/clients/${p.client_id}`); revalidatePath("/");
});

export const deleteProjectUpdateAction = safe(async (form: FormData) => {
  await requireStaff();
  const sb = await supabaseServer();
  const { error } = await sb.from("project_updates").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`); revalidatePath("/");
});

/* ------------------------------------------------------------ client history (admin only) */
export const addHistoryEntryAction = safe(async (form: FormData) => {
  const me = await requireAdmin();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const detail = str(form, "detail").slice(0, 500);
  if (!client_id || !detail) throw new Error("Write what happened");
  const when = isoDateTime(form, "occurred_at");
  const { error } = await sb.from("activity_log").insert({ actor: me.id, client_id, action: "manual", detail, client_visible: form.get("visible") === "on", ...(when ? { created_at: when } : {}) });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${client_id}`); revalidatePath("/");
});

export const updateHistoryEntryAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const id = Number(str(form, "id"));
  const detail = str(form, "detail").slice(0, 500);
  if (!Number.isInteger(id) || !detail) throw new Error("Write what happened");
  const when = isoDateTime(form, "occurred_at");
  const { data, error } = await sb.from("activity_log").update({ detail, client_visible: form.get("visible") === "on", ...(when ? { created_at: when } : {}) }).eq("id", id).select("client_id").single();
  if (error || !data) throw new Error(error?.message ?? "Entry not found");
  revalidatePath(`/clients/${data.client_id}`); revalidatePath("/");
});

export const deleteHistoryEntryAction = safe(async (form: FormData) => {
  await requireAdmin();
  const sb = await supabaseServer();
  const id = Number(str(form, "id"));
  if (!Number.isInteger(id)) throw new Error("Entry not found");
  const { data, error } = await sb.from("activity_log").delete().eq("id", id).select("client_id").single();
  if (error || !data) throw new Error(error?.message ?? "Entry not found");
  revalidatePath(`/clients/${data.client_id}`); revalidatePath("/");
});

/* ------------------------------------------------------------ marketing: brand kit, accounts, results */
const PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "tiktok", "whatsapp", "google_business", "other"];
const clip = (f: FormData, k: string, n: number) => str(f, k).slice(0, n) || null;

export const saveBrandAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  if (!client_id) throw new Error("Client missing");
  const { error } = await sb.from("client_brand").upsert({
    client_id, tagline: clip(form, "tagline", 200), tone: clip(form, "tone", 400), audience: clip(form, "audience", 600), colors: clip(form, "colors", 300),
    fonts: clip(form, "fonts", 200), hashtags: clip(form, "hashtags", 500), goals: clip(form, "goals", 800), dont: clip(form, "dont", 600), assets_link: clip(form, "assets_link", 300),
    updated_by: me.id, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${client_id}`);
});

export const addSocialAccountAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const platform = PLATFORMS.includes(str(form, "platform")) ? str(form, "platform") : "other";
  const handle = str(form, "handle");
  if (!client_id || !handle) throw new Error("Enter the account name or handle");
  const url = str(form, "url");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("The link should start with https://");
  const { error } = await sb.from("social_accounts").insert({ client_id, platform, handle: handle.slice(0, 120), url: url || null });
  if (error) throw new Error(error.code === "23505" ? "That account is already added" : error.message);
  revalidatePath(`/clients/${client_id}`); revalidatePath("/");
});

export const deleteSocialAccountAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const { error } = await sb.from("social_accounts").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`); revalidatePath("/");
});

const intOrNull = (f: FormData, k: string) => { const v = str(f, k); if (v === "") return null; const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0) throw new Error("Numbers must be zero or more"); return n; };

export const saveMetricsAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const month = str(form, "month");
  if (!client_id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Pick the month");
  const spend = str(form, "ad_spend");
  const row = {
    client_id, period: `${month}-01`, platform: str(form, "platform") || "all",
    followers: intOrNull(form, "followers"), reach: intOrNull(form, "reach"), impressions: intOrNull(form, "impressions"), engagement: intOrNull(form, "engagement"),
    ad_spend: spend === "" ? null : Math.max(0, Number(spend)), ad_currency: spend === "" ? null : cur(form, "ad_currency"),
    notes: clip(form, "notes", 800), created_by: me.id,
  };
  const { error } = await sb.from("client_metrics").upsert(row, { onConflict: "client_id,period,platform" });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${client_id}`); revalidatePath("/");
});

export const deleteMetricsAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const { error } = await sb.from("client_metrics").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`); revalidatePath("/");
});

/* ------------------------------------------------------------ leads */
const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];

export const addLeadAction = safe(async (form: FormData) => {
  const me = await requireActive();
  const sb = await supabaseServer();
  const client_id = me.role === "client" ? me.client_id : str(form, "client_id");
  const name = str(form, "name").slice(0, 120);
  if (!client_id) throw new Error("Pick the client");
  if (!name) throw new Error("Enter the person's name");
  const value = str(form, "value");
  const { error } = await sb.from("leads").insert({
    client_id, name, phone: clip(form, "phone", 40), email: clip(form, "email", 160), source: clip(form, "source", 40) ?? "manual",
    value: value === "" ? null : Math.max(0, Number(value)), notes: clip(form, "notes", 800), created_by: me.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${client_id}`); revalidatePath("/");
});

export const updateLeadAction = safe(async (form: FormData) => {
  await requireActive();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const status = str(form, "status");
  if (!LEAD_STATUSES.includes(status)) throw new Error("Pick a status");
  const value = str(form, "value");
  const { data, error } = await sb.from("leads").update({
    status, name: str(form, "name").slice(0, 120) || undefined, phone: clip(form, "phone", 40), email: clip(form, "email", 160),
    value: value === "" ? null : Math.max(0, Number(value)), notes: clip(form, "notes", 800),
  }).eq("id", id).select("client_id").single();
  if (error || !data) throw new Error(error?.message ?? "Lead not found");
  revalidatePath(`/clients/${data.client_id}`); revalidatePath("/");
});

export const deleteLeadAction = safe(async (form: FormData) => {
  await requireActive();
  const sb = await supabaseServer();
  const { data, error } = await sb.from("leads").delete().eq("id", str(form, "id")).select("client_id").single();
  if (error || !data) throw new Error(error?.message ?? "Lead not found");
  revalidatePath(`/clients/${data.client_id}`); revalidatePath("/");
});

/* ------------------------------------------------------------ content calendar */
export const reschedulePostAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  requireSocial(me);
  const sb = await supabaseServer();
  const when = isoDateTime(form, "scheduled_at");
  const { error } = await sb.from("social_posts").update({ scheduled_at: str(form, "clear") === "1" ? null : when }).eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/calendar"); revalidatePath("/studio");
});

/* ------------------------------------------------------------ recurring tasks (admin/manager) */
export const createTemplateAction = safe(async (form: FormData) => {
  const me = await requireLead();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const title = str(form, "title");
  const cadence = str(form, "cadence") === "monthly" ? "monthly" : "weekly";
  if (!client_id || title.length < 3) throw new Error("Give the task a short title");
  const who = str(form, "assignee");
  const assignee = who.startsWith("role:") ? null : who || null;
  const role = who.startsWith("role:") ? who.slice(5) : null;
  const { error } = await sb.from("task_templates").insert({
    client_id, title: title.slice(0, 140), description: clip(form, "description", 500), cadence,
    weekday: cadence === "weekly" ? Math.min(7, Math.max(1, Number(str(form, "weekday")) || 1)) : null,
    day_of_month: cadence === "monthly" ? Math.min(28, Math.max(1, Number(str(form, "day_of_month")) || 1)) : null,
    assignee, assignee_role: role, due_in_days: Math.min(60, Math.max(0, Number(str(form, "due_in_days")) || 3)), created_by: me.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${client_id}`);
});

export const toggleTemplateAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  const { error } = await sb.from("task_templates").update({ active: str(form, "active") === "true" }).eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
});

export const deleteTemplateAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  const { error } = await sb.from("task_templates").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${str(form, "client_id")}`);
});

// Create the task from a template right now (for example to try it out), without waiting for its day.
export const runTemplateNowAction = safe(async (form: FormData) => {
  const me = await requireLead();
  const sb = await supabaseServer();
  const { data: t } = await sb.from("task_templates").select("*").eq("id", str(form, "id")).single();
  if (!t) throw new Error("Template not found");
  const assignee = t.assignee ?? (t.assignee_role ? await pickAssignee([t.assignee_role]) : null);
  const { error } = await sb.from("work_items").insert({ client_id: t.client_id, title: t.title, assignee, due_date: dueDateFor(t, isoDay()), visible_to_client: false, auto_created: true, template_id: t.id });
  if (error) throw new Error(error.message);
  if (assignee) later(() => notifyUsers([assignee], { title: "New task for you", body: snip(t.title), url: "/tasks" }, me.id));
  revalidatePath(`/clients/${t.client_id}`); revalidatePath("/tasks");
});

/* ------------------------------------------------------------ clients ask for more */
export const requestServiceAction = safe(async (form: FormData) => {
  const me = await requireActive();
  if (me.role !== "client" || !me.client_id) throw new Error("Only clients can request services");
  const sb = await supabaseServer();
  const service_id = str(form, "service_id");
  const { data: svc } = await sb.from("services").select("name").eq("id", service_id).single();
  if (!svc) throw new Error("That service isn't available");
  const pkgId = str(form, "package_id");
  const { data: pkg } = pkgId ? await sb.from("packages").select("name").eq("id", pkgId).single() : { data: null };
  const note = str(form, "note").slice(0, 1500);
  const subject = `Request: ${svc.name}${pkg ? ` (${pkg.name})` : ""}`;
  const { data: t, error } = await sb.from("tickets").insert({ client_id: me.client_id, subject: subject.slice(0, 140), category: "new_service", priority: "normal", created_by: me.id }).select("id,ticket_no").single();
  if (error || !t) throw new Error(error?.message ?? "Could not send your request");
  await sb.from("ticket_messages").insert({ ticket_id: t.id, author_id: me.id, body: note || `I'd like to add ${svc.name}${pkg ? ` (${pkg.name} package)` : ""}. Please tell me the next steps.` });
  later(async () => notifyUsers(await leadIds(), { title: "A client wants a new service", body: snip(`${who(me)}: ${subject}`), url: `/tickets/${t.id}` }, me.id));
  revalidatePath("/tickets"); revalidatePath("/");
});

/* ------------------------------------------------------------ shared files (links) */
const fileErr = (e: { code?: string; message: string }) => new Error(isMissingTable(e) ? "Shared files aren't switched on yet. Run the database update (migration 0016) in Supabase first." : e.message);
const refreshFiles = (client_id: string) => { revalidatePath(`/clients/${client_id}`); revalidatePath("/"); revalidatePath("/approvals"); };

async function fileRows(sb: Sb, client_id: string) {
  const { data, error } = await sb.from("client_files").select("id,parent_id,kind,status,title,created_by").eq("client_id", client_id);
  if (error) throw fileErr(error);
  return data ?? [];
}

export const createFolderAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const title = str(form, "title").slice(0, 140);
  if (!client_id || !title) throw new Error("Give the folder a name");
  const { error } = await sb.from("client_files").insert({ client_id, parent_id: str(form, "parent_id") || null, kind: "folder", title, created_by: me.id });
  if (error) throw fileErr(error);
  refreshFiles(client_id);
});

export const addFileLinkAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const client_id = str(form, "client_id");
  const url = normalizeUrl(str(form, "url"));
  if (!client_id) throw new Error("Client missing");
  if (!url) throw new Error("Paste a working link, for example from Google Drive");
  const title = str(form, "title").slice(0, 140) || PROVIDERS[detectProvider(url)] + " file";
  const { error } = await sb.from("client_files").insert({ client_id, parent_id: str(form, "parent_id") || null, kind: "link", title, url, provider: detectProvider(url), notes: clip(form, "notes", 500), created_by: me.id });
  if (error) throw fileErr(error);
  refreshFiles(client_id);
});

export const updateFileAction = safe(async (form: FormData) => {
  await requireStaff();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const patch: Record<string, unknown> = { title: str(form, "title").slice(0, 140), notes: clip(form, "notes", 500) };
  if (!patch.title) throw new Error("The name can't be empty");
  if (form.has("url")) { const url = normalizeUrl(str(form, "url")); if (!url) throw new Error("Paste a working link"); patch.url = url; patch.provider = detectProvider(url); }
  const { data, error } = await sb.from("client_files").update(patch).eq("id", id).select("client_id,status").single();
  if (error || !data) throw error ? fileErr(error) : new Error("File not found");
  refreshFiles(data.client_id);
});

// A teammate says "this is ready for the client". A folder takes everything inside it that is still internal.
export const submitFileAction = safe(async (form: FormData) => {
  const me = await requireStaff();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: item } = await sb.from("client_files").select("client_id,kind,title,status").eq("id", id).single();
  if (!item) throw new Error("File not found");
  const rows = await fileRows(sb, item.client_id);
  const ids = [id, ...(item.kind === "folder" ? descendantIds(rows, id).filter((x) => rows.find((r) => r.id === x)?.status === "internal") : [])];
  const { error } = await sb.from("client_files").update({ status: "pending" }).in("id", ids).eq("status", "internal");
  if (error) throw fileErr(error);
  later(async () => notifyUsers(await leadIds(), { title: "Files waiting to be shared with a client", body: snip(`${who(me)}: ${item.title}`), url: "/approvals" }, me.id));
  refreshFiles(item.client_id);
});

// Manager or admin: share with the client. A folder shares itself and everything inside that was submitted.
export const approveFileAction = safe(async (form: FormData) => {
  const me = await requireLead();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: item } = await sb.from("client_files").select("client_id,kind,title,created_by").eq("id", id).single();
  if (!item) throw new Error("File not found");
  const rows = await fileRows(sb, item.client_id);
  const inside = item.kind === "folder" ? descendantIds(rows, id).filter((x) => rows.find((r) => r.id === x)?.status === "pending") : [];
  const { error } = await sb.from("client_files").update({ status: "shared", approved_by: me.id }).in("id", [id, ...inside]);
  if (error) throw fileErr(error);
  later(async () => {
    await notifyUsers(await clientUserIds(item.client_id), { title: "New files shared with you", body: snip(item.title), url: "/" });
    await notifyUsers([item.created_by], { title: "Your files were shared with the client", body: snip(item.title), url: `/clients/${item.client_id}?tab=files` }, me.id);
  });
  refreshFiles(item.client_id);
});

// Back to team-only (stop sharing, or turn down a request). Everything inside a folder goes back too, and public links stop working.
export const returnFileAction = safe(async (form: FormData) => {
  const me = await requireLead();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: item } = await sb.from("client_files").select("client_id,kind,title,status,created_by").eq("id", id).single();
  if (!item) throw new Error("File not found");
  const rows = await fileRows(sb, item.client_id);
  const ids = [id, ...(item.kind === "folder" ? descendantIds(rows, id) : [])];
  const { error } = await sb.from("client_files").update({ status: "internal", public_token: null, approved_by: null }).in("id", ids).neq("status", "internal");
  if (error) throw fileErr(error);
  if (item.status === "pending") later(() => notifyUsers([item.created_by], { title: "Not shared with the client yet", body: snip(item.title), url: `/clients/${item.client_id}?tab=files` }, me.id));
  refreshFiles(item.client_id);
});

export const deleteFileAction = safe(async (form: FormData) => {
  await requireStaff();
  const sb = await supabaseServer();
  const { data, error } = await sb.from("client_files").delete().eq("id", str(form, "id")).select("client_id").single();
  if (error || !data) throw error ? fileErr(error) : new Error("That file can't be deleted (shared files can only be removed by a manager or the admin)");
  refreshFiles(data.client_id);
});

// Anyone with the link can open a shared folder or file, without signing in. Turn it on or off.
export const togglePublicLinkAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  const id = str(form, "id");
  const { data: item } = await sb.from("client_files").select("client_id,status,public_token").eq("id", id).single();
  if (!item) throw new Error("File not found");
  if (item.status !== "shared") throw new Error("Share it with the client first");
  const { error } = await sb.from("client_files").update({ public_token: item.public_token ? null : newToken() }).eq("id", id);
  if (error) throw fileErr(error);
  refreshFiles(item.client_id);
});


/* ------------------------------------------------------------------ Anweo sales (prospects) */
async function requireSales() {
  const me = await requireActive();
  if (!["admin", "manager", "marketing", "social_manager"].includes(me.role)) throw new Error("Sales is for the marketing team");
  return me;
}
const clean = (v: string | null | undefined, n = 300) => (v ? v.trim().slice(0, n) || null : null);
const url = (v: string | null) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null);

export const addProspectAction = safe(async (form: FormData) => {
  const me = await requireSales();
  const business_name = str(form, "business_name");
  if (!business_name) throw new Error("Please enter the business name");
  const f = {
    website: clean(url(clean(str(form, "website")))), instagram: clean(str(form, "instagram")), phone: clean(str(form, "phone"), 40),
  };
  const sb = await supabaseServer();
  const { data: have } = await sb.from("prospects").select("id,business_name,phone,city").limit(5000);
  const mine = new Set(dupeKeys({ phone: f.phone, business_name, city: str(form, "city") }));
  const same = (have ?? []).find((h: any) => dupeKeys(h).some((k) => mine.has(k)));
  if (same) throw new Error(`${(same as any).business_name} is already in the pipeline`);
  const { data, error } = await sb.from("prospects").insert({
    business_name: business_name.slice(0, 160), contact_name: clean(str(form, "contact_name"), 120), email: clean(str(form, "email"), 160), ...f,
    city: clean(str(form, "city"), 80), category: clean(str(form, "category"), 80), source: str(form, "source") || "manual",
    service_interest: clean(str(form, "service_interest"), 80), notes: clean(str(form, "notes"), 2000),
    score: opportunityScore(f), assigned_to: me.id, created_by: me.id,
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/growth");
  redirect(`/growth/${data.id}`);
});

export const updateProspectAction = safe(async (form: FormData) => {
  await requireSales();
  const id = str(form, "id");
  const business_name = str(form, "business_name");
  if (!id || !business_name) throw new Error("Business name is required");
  const f = { website: clean(url(clean(str(form, "website")))), instagram: clean(str(form, "instagram")), phone: clean(str(form, "phone"), 40) };
  const est = str(form, "est_value");
  const sb = await supabaseServer();
  const { error } = await sb.from("prospects").update({
    business_name: business_name.slice(0, 160), contact_name: clean(str(form, "contact_name"), 120), email: clean(str(form, "email"), 160), ...f,
    address: clean(str(form, "address")), city: clean(str(form, "city"), 80), category: clean(str(form, "category"), 80),
    service_interest: clean(str(form, "service_interest"), 80), notes: clean(str(form, "notes"), 2000),
    est_value: est && Number(est) >= 0 ? Number(est) : null, currency: cur(form, "currency", "GBP"),
    next_follow_up: str(form, "next_follow_up") || null, assigned_to: str(form, "assigned_to") || null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/growth/${id}`); revalidatePath("/growth");
});

export const setProspectStatusAction = safe(async (form: FormData) => {
  const me = await requireSales();
  const id = str(form, "id"), status = str(form, "status");
  if (!id || !isStage(status)) throw new Error("Unknown stage");
  if (status === "won") throw new Error("Use “Convert to client” to win a prospect");
  const sb = await supabaseServer();
  const lost_reason = status === "lost" ? clean(str(form, "lost_reason"), 200) : null;
  const days = FOLLOW_UP_DAYS[status];
  const { error } = await sb.from("prospects").update({ status, lost_reason, last_touch_at: new Date().toISOString(), next_follow_up: days == null ? null : addDays(isoDay(), days) }).eq("id", id);
  if (error) throw new Error(error.message);
  await sb.from("prospect_activities").insert({ prospect_id: id, kind: "status", body: `Moved to ${STAGES.find((x) => x.id === status)?.label}${lost_reason ? ` — ${lost_reason}` : ""}`, created_by: me.id });
  revalidatePath(`/growth/${id}`); revalidatePath("/growth");
});

// Log a call, message or note. Sending a first message moves a new prospect to "contacted" by itself.
export const logProspectActivityAction = safe(async (form: FormData) => {
  const me = await requireSales();
  const id = str(form, "id");
  const kind = str(form, "kind") || "note";
  const body = clean(str(form, "body"), 2000);
  if (!id) throw new Error("Missing prospect");
  if (!["note", "call", "whatsapp", "email", "dm", "meeting"].includes(kind)) throw new Error("Unknown activity");
  const sb = await supabaseServer();
  const { error } = await sb.from("prospect_activities").insert({ prospect_id: id, kind, body, created_by: me.id });
  if (error) throw new Error(error.message);
  const patch: Record<string, unknown> = { last_touch_at: new Date().toISOString() };
  const next = str(form, "next_follow_up");
  if (next) patch.next_follow_up = next;
  if (kind !== "note") {
    const { data: p } = await sb.from("prospects").select("status").eq("id", id).single();
    if (p?.status === "new") patch.status = "contacted";
    if (!next && ["contacted", "new"].includes(p?.status ?? "")) patch.next_follow_up = addDays(isoDay(), 3); // default: follow up in 3 days
  }
  await sb.from("prospects").update(patch).eq("id", id);
  revalidatePath(`/growth/${id}`); revalidatePath("/growth");
});

export const deleteProspectAction = safe(async (form: FormData) => {
  await requireLead();
  const sb = await supabaseServer();
  const { error } = await sb.from("prospects").delete().eq("id", str(form, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/growth");
  redirect("/growth");
});

// A won prospect becomes a client in one step (managers and admin only, like creating any client).
export const convertProspectAction = safe(async (form: FormData) => {
  const me = await requireLead();
  const id = str(form, "id");
  const sb = await supabaseServer();
  const { data: p } = await sb.from("prospects").select("*").eq("id", id).single();
  if (!p) throw new Error("Prospect not found");
  if (p.client_id) redirect(`/clients/${p.client_id}`);
  const country = str(form, "country") || p.country || "United Kingdom";
  const { data: c, error } = await sb.from("clients").insert({
    business_name: p.business_name, contact_name: p.contact_name, email: p.email, phone: p.phone, country,
    currency: cur(form, "currency", currencyForCountry(country)),
    notes: [p.notes, p.service_interest ? `Interested in: ${p.service_interest}` : null, p.website ? `Website: ${p.website}` : null].filter(Boolean).join("\n") || null,
    created_by: me.id,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await sb.from("prospects").update({ status: "won", client_id: c.id, next_follow_up: null }).eq("id", id);
  await sb.from("prospect_activities").insert({ prospect_id: id, kind: "status", body: "Won — converted to a client", created_by: me.id });
  await logEvent(sb, me.id, c.id, "client_created", "Welcome to Anweo", true);
  revalidatePath("/growth"); revalidatePath("/");
  redirect(`/clients/${c.id}`);
});

// Import prospects from the standard sheet. The browser has already parsed and previewed them; everything is checked again here,
// and anyone already in the pipeline (same phone, or same name in the same city) is skipped.
export async function importProspectsAction(items: { business_name: string; contact_name?: string; phone?: string; email?: string; website?: string; instagram?: string; city?: string; category?: string; notes?: string }[]): Promise<{ error?: string; added?: number; skipped?: number }> {
  try {
    const me = await requireSales();
    const list = (Array.isArray(items) ? items : []).slice(0, 500).filter((i) => i && typeof i.business_name === "string" && i.business_name.trim());
    if (!list.length) return { error: "No valid rows to import" };
    const sb = await supabaseServer();
    const { data: have } = await sb.from("prospects").select("business_name,phone,city").limit(5000);
    const seen = new Set((have ?? []).flatMap((h: any) => dupeKeys(h)));
    const rows: Record<string, unknown>[] = [];
    let skipped = 0;
    for (const p of list) {
      const keys = dupeKeys({ phone: p.phone, business_name: p.business_name, city: p.city });
      if (keys.some((k) => seen.has(k))) { skipped++; continue; }
      keys.forEach((k) => seen.add(k));
      const f = { website: clean(url(clean(p.website ?? null)), 300), instagram: clean(p.instagram ?? null), phone: clean(p.phone ?? null, 40) };
      rows.push({
        business_name: p.business_name.trim().slice(0, 160), contact_name: clean(p.contact_name ?? null, 120), email: clean(p.email ?? null, 160), ...f,
        city: clean(p.city ?? null, 80), category: clean(p.category ?? null, 80), notes: clean(p.notes ?? null, 2000),
        source: "csv", score: opportunityScore(f), assigned_to: me.id, created_by: me.id,
      });
    }
    if (rows.length) {
      const { error } = await sb.from("prospects").insert(rows);
      if (error) return { error: error.message };
    }
    revalidatePath("/growth");
    return { added: rows.length, skipped };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed" };
  }
}
