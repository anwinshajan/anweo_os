import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { Empty, PageHead, fmtDate } from "@/components/Shell";
import { Icon } from "@/components/NavLinks";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function ChatIndex() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");

  // Clients go straight to their own thread.
  if (me.role === "client") {
    return (
      <Shell me={me}>
        <PageHead tag="Chat" title="Talk to us" sub="Message the Anweo team directly, or ask Anweo AI for a quick answer." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href={me.client_id ? `/chat/c/${me.client_id}` : "/"} className="card block transition hover:-translate-y-0.5 hover:border-forest/40">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-forest text-lime"><Icon name="chat" /></span>
            <p className="mt-3 text-lg font-bold">Anweo team</p>
            <p className="text-sm text-mute">Your account manager and the team working on your projects.</p>
          </Link>
          <Link href="/chat/ai" className="card-green block transition hover:-translate-y-0.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime text-ink"><Icon name="ai" /></span>
            <p className="mt-3 text-lg font-bold">Anweo AI</p>
            <p className="text-sm text-paper/70">Instant answers about your services, projects and billing.</p>
          </Link>
        </div>
      </Shell>
    );
  }

  const sb = await supabaseServer();
  const [{ data: clients }, { data: last }] = await Promise.all([
    sb.from("clients").select("id,business_name").eq("status", "active").order("business_name"),
    sb.from("messages").select("client_id,body,created_at").not("client_id", "is", null).order("created_at", { ascending: false }).limit(200),
  ]);
  const latest = new Map<string, { body: string; created_at: string }>();
  (last ?? []).forEach((m: any) => { if (!latest.has(m.client_id)) latest.set(m.client_id, m); });
  const sorted = [...(clients ?? [])].sort((a, b) => (latest.get(b.id)?.created_at ?? "").localeCompare(latest.get(a.id)?.created_at ?? ""));

  return (
    <Shell me={me}>
      <PageHead tag="Chat" title="Messages" sub="Talk to your team, to clients, or ask Anweo AI." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link href="/chat/team" className="card block !p-4 transition hover:-translate-y-0.5 hover:border-forest/40">
          <p className="tag">Internal</p><p className="mt-1 text-lg font-bold">Team channel</p><p className="text-sm text-mute">Staff only. Clients can't see this.</p>
        </Link>
        <Link href="/chat/ai" className="card-green block !p-4 transition hover:-translate-y-0.5">
          <p className="tag !text-lime">Assistant</p><p className="mt-1 text-lg font-bold">Anweo AI</p><p className="text-sm text-paper/70">Ask about clients, packages and how things work.</p>
        </Link>
      </div>
      <p className="tag mb-3">[ Client conversations ]</p>
      <div className="space-y-2">
        {sorted.length === 0 && <Empty>No clients yet.</Empty>}
        {sorted.map((c) => {
          const m = latest.get(c.id);
          return (
            <Link key={c.id} href={`/chat/c/${c.id}`} className="card flex items-center gap-4 !p-4 transition hover:-translate-y-0.5 hover:border-forest/40">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest text-base font-bold text-lime">{c.business_name[0]?.toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.business_name}</p>
                <p className="truncate text-xs text-mute">{m ? m.body : "No messages yet"}</p>
              </div>
              {m && <span className="shrink-0 font-mono text-[10px] text-mute">{fmtDate(m.created_at)}</span>}
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
