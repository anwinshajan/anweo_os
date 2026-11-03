import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase-server";

// Every notification is saved for the in-app bell first (that is the source of truth), then pushed to the person's
// devices. Push is best-effort: a missing key or a dead device never breaks the action that triggered it.
// Web Push covers browsers and the home-screen app (including iPhone). The Android app will add FCM here later.

let ready = false;
function vapidReady() {
  if (ready) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:admin@anweo.com", pub, priv);
  ready = true;
  return true;
}

export type Note = { title: string; body?: string; url?: string; priority?: boolean };

export async function notifyUsers(userIds: (string | null | undefined)[], n: Note, except?: string) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== except))];
  if (ids.length === 0) return;
  try {
    const admin = supabaseAdmin();
    await admin.from("notifications").insert(ids.map((user_id) => ({ user_id, title: n.title, body: n.body ?? null, url: n.url ?? null, priority: !!n.priority })));
    if (!vapidReady()) return;
    const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,keys").in("user_id", ids).eq("kind", "web");
    const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url ?? "/", priority: !!n.priority, tag: n.priority ? "priority" : undefined });
    await Promise.allSettled(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, payload, n.priority ? { TTL: 86400, urgency: "high" } : { TTL: 3600 });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id); // device is gone
          else console.error("push failed", code);
        }
      })
    );
  } catch (e) {
    console.error("notify failed", e);
  }
}

// ---- who should hear about what
async function profileIds(apply: (q: any) => any): Promise<string[]> {
  const { data } = (await apply(supabaseAdmin().from("profiles").select("id").eq("status", "active"))) as { data: { id: string }[] | null };
  return (data ?? []).map((r) => r.id);
}
export const leadIds = () => profileIds((q: any) => q.in("role", ["admin", "manager"]));
export const adminIds = () => profileIds((q: any) => q.eq("role", "admin"));
export const staffIds = () => profileIds((q: any) => q.neq("role", "client"));
export const clientUserIds = (clientId: string) => profileIds((q: any) => q.eq("client_id", clientId));

export const snip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
