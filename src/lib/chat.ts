import { getMe, supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export type Person = { id: string; name: string; role: string };

// People that can be @mentioned (or messaged) from a given chat, always excluding yourself.
// Staff can mention any active staff member; admin/managers can also mention that client's users (other staff never talk to clients directly).
// Clients can only mention the people who run their account (admin and managers).
export async function mentionPeople(me: { id: string; role: string; client_id: string | null }, clientId: string | null): Promise<Person[]> {
  const admin = supabaseAdmin();
  let q = admin.from("profiles").select("id,full_name,email,role,client_id").eq("status", "active").neq("id", me.id);
  if (me.role === "client") q = q.in("role", ["admin", "manager"]);
  else if (clientId && (me.role === "admin" || me.role === "manager")) q = q.or(`role.neq.client,client_id.eq.${clientId}`);
  else q = q.neq("role", "client");
  const { data } = await q.order("full_name");
  return (data ?? []).map((p: any) => ({ id: p.id, name: p.full_name || p.email || "Someone", role: p.role }));
}

export const teamPeople = (me: { id: string; role: string; client_id: string | null }) => mentionPeople(me, null);

// Unread badges. Keys: "team", "client:<id>", "dm:<otherUserId>".
export async function markRead(thread: string) {
  const me = await getMe();
  if (!me) return;
  const sb = await supabaseServer();
  await sb.from("chat_reads").upsert({ user_id: me.id, thread, last_read_at: new Date().toISOString() }, { onConflict: "user_id,thread" });
}

export async function unreadByThread(): Promise<Map<string, number>> {
  try {
    const sb = await supabaseServer();
    const { data } = await sb.rpc("unread_counts");
    return new Map(((data ?? []) as { thread: string; n: number }[]).map((r) => [r.thread, r.n]));
  } catch {
    return new Map();
  }
}
