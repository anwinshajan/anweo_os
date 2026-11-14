import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Shell, { PageHead } from "@/components/Shell";
import ChatBox, { type Msg } from "@/components/ChatBox";
import { mentionPeople } from "@/lib/chat";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isLeadRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function ClientChat({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const { id } = await params;
  // A client can only open their own thread (the database enforces this as well).
  if (me.role === "client" && me.client_id !== id) redirect(me.client_id ? `/chat/c/${me.client_id}` : "/");

  const sb = await supabaseServer();
  const lead = isLeadRole(me.role);
  // Team members only get the client's name (never contact details), and only for clients they were given work for.
  const client = lead || me.role === "client"
    ? (await sb.from("clients").select("business_name").eq("id", id).single()).data
    : ((await sb.rpc("visible_clients")).data as { id: string; business_name: string }[] | null)?.find((c) => c.id === id) ?? null;
  if (!client) notFound();
  const { data } = await sb.rpc("chat_thread", { p_client: id, p_limit: 100 });
  const messages = ((data ?? []) as Msg[]).slice().reverse();
  const isClient = me.role === "client";
  const people = await mentionPeople(me, id);

  return (
    <Shell me={me}>
      <Link href={isClient ? "/chat" : "/chat"} className="tag hover:text-forest">← All chats</Link>
      <div className="mt-3" />
      <PageHead tag={isClient ? "Chat" : "Client"} title={isClient ? "Anweo team" : client.business_name} sub={isClient ? "We usually reply within a working day." : lead ? "Team replies wait here for your approval before the client sees them." : "Messages you write here are checked by a manager before the client sees them."}>
        {!isClient && <Link href={`/clients/${id}`} className="btn-ghost">{lead ? "Open client" : "Open work"}</Link>}
      </PageHead>
      <ChatBox clientId={id} meId={me.id} meIsClient={isClient} messages={messages} people={people} meName={me.full_name || me.email || ""} meIsLead={lead} supervised={!isClient && !lead} />
    </Shell>
  );
}
