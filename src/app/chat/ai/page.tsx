import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { PageHead } from "@/components/Shell";
import AiChat from "@/components/AiChat";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { isLeadRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const sb = await supabaseServer();
  const { data } = await sb.from("ai_messages").select("role,content").order("created_at", { ascending: false }).limit(30);
  const initial = (data ?? []).reverse() as { role: "user" | "assistant"; content: string }[];

  const suggestions =
    me.role === "client"
      ? ["What's included in my plan?", "When is my next post going out?", "How are my projects going?", "What do I owe right now?"]
      : isLeadRole(me.role)
      ? ["Which clients have no services yet?", "Summarise our packages", "Draft a short welcome message for a new client"]
      : ["What services and packages do we offer?", "Help me write a caption for a salon offer", "Explain how approvals work"];

  return (
    <Shell me={me}>
      <Link href="/chat" className="tag hover:text-forest">← All chats</Link>
      <div className="mt-3" />
      <PageHead tag="Assistant" title="Anweo AI" sub={me.role === "client" ? "Ask about your services, projects and billing. For changes, message the team." : "Your assistant for Anweo. It can read what your role can see, but it can't change anything."} />
      <AiChat initial={initial} suggestions={suggestions} />
    </Shell>
  );
}
