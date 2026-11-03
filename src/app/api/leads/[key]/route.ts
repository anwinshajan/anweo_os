import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { clientUserIds, leadIds, notifyUsers, snip } from "@/lib/notify";

export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n) : "");

// Public endpoint for a client's website form. The long random key in the URL says which client the lead belongs to.
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[0-9a-f]{32}$/.test(key)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: CORS });

  let body: Record<string, unknown> = {};
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("application/json")) body = await req.json();
    else body = Object.fromEntries((await req.formData()).entries());
  } catch { return NextResponse.json({ ok: false, error: "Could not read the form" }, { status: 400, headers: CORS }); }

  const done = (status: number, payload: Record<string, unknown>) => {
    const redirect = clean(body.redirect, 300);
    if (status === 200 && /^https:\/\//i.test(redirect) && !ctype.includes("application/json")) return NextResponse.redirect(redirect, 303);
    return NextResponse.json(payload, { status, headers: CORS });
  };
  if (clean(body.website, 50) || clean(body._gotcha, 50)) return done(200, { ok: true }); // hidden spam trap: pretend it worked

  const name = clean(body.name, 120);
  const phone = clean(body.phone, 40), email = clean(body.email, 160);
  if (!name) return done(400, { ok: false, error: "Please enter your name" });
  if (!phone && !email) return done(400, { ok: false, error: "Please add a phone number or email" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return done(400, { ok: false, error: "That email doesn't look right" });

  const admin = supabaseAdmin();
  const { data: client } = await admin.from("clients").select("id,business_name,status").eq("lead_key", key).maybeSingle();
  if (!client || client.status !== "active") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: CORS });

  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("client_id", client.id).gte("created_at", since);
  if ((count ?? 0) >= 40) return done(429, { ok: false, error: "Too many enquiries right now. Please try again shortly." });

  const source = clean(body.source, 40) || "website";
  const { error } = await admin.from("leads").insert({ client_id: client.id, name, phone: phone || null, email: email || null, source, notes: clean(body.message, 800) || null });
  if (error) { console.error("lead insert failed", error.message); return done(500, { ok: false, error: "Could not save your enquiry" }); }

  const msg = snip(`${name}${phone ? ` · ${phone}` : ""}${email ? ` · ${email}` : ""}`);
  try {
    await notifyUsers(await clientUserIds(client.id), { title: "New enquiry from your website", body: msg, url: "/" });
    await notifyUsers(await leadIds(), { title: `New lead for ${client.business_name}`, body: msg, url: `/clients/${client.id}?tab=leads` });
  } catch (e) { console.error("lead notify failed", e); }
  return done(200, { ok: true });
}
