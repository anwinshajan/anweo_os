import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { PageHead } from "@/components/Shell";
import ChatBox, { type Msg } from "@/components/ChatBox";
import { teamPeople } from "@/lib/chat";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function TeamChat() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const sb = await supabaseServer();
  const { data } = await sb.rpc("chat_thread", { p_client: null, p_limit: 100 });
  const people = await teamPeople(me);
  const messages = ((data ?? []) as Msg[]).slice().reverse();
  return (
    <Shell me={me}>
      <Link href="/chat" className="tag hover:text-forest">← All chats</Link>
      <div className="mt-3" />
      <PageHead tag="Internal" title="Team channel" sub="Only Anweo staff can see this conversation." />
      <ChatBox clientId={null} meId={me.id} meIsClient={false} messages={messages} people={people} meName={me.full_name || me.email || ""} />
    </Shell>
  );
}
