import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Shell, { PageHead } from "@/components/Shell";
import ChatBox, { type Msg } from "@/components/ChatBox";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// A private conversation between two team members. Only the two of them can read it.
export default async function DirectChat({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active" || me.role === "client") redirect("/");
  const { id } = await params;
  if (id === me.id) redirect("/chat");
  const sb = await supabaseServer();
  const { data: other } = await sb.from("profiles").select("id,full_name,email,role,status").eq("id", id).maybeSingle();
  if (!other || other.role === "client") notFound();
  const { data } = await sb.rpc("dm_thread", { p_other: id, p_limit: 100 });
  const messages = ((data ?? []) as Msg[]).slice().reverse();
  const name = other.full_name || other.email || "Team member";
  return (
    <Shell me={me}>
      <Link href="/chat" className="tag hover:text-forest">← All chats</Link>
      <div className="mt-3" />
      <PageHead tag={`Direct · ${other.role}`} title={name} sub="Private. Only you and this person can see these messages." />
      <ChatBox clientId={null} recipientId={id} meId={me.id} meIsClient={false} messages={messages} />
    </Shell>
  );
}
