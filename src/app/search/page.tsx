import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { Empty, PageHead } from "@/components/Shell";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { statusLabel, ticketRef } from "@/lib/tickets";

export const dynamic = "force-dynamic";

type Hit = { href: string; title: string; sub?: string };

// One search box for everything the signed-in person is allowed to see (the database decides what that is).
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const { q = "" } = await searchParams;
  const term = q.replace(/[%_\\,()*]/g, " ").trim().slice(0, 60);
  const like = `%${term}%`;
  const isClient = me.role === "client";
  const sb = await supabaseServer();
  const groups: { name: string; hits: Hit[] }[] = [];

  if (term.length >= 2) {
    const [clients, projects, tickets, tasks, posts, invoices, docs] = await Promise.all([
      isClient ? { data: [] as any[] } : sb.from("clients").select("id,business_name,contact_name,email").or(`business_name.ilike.${like},contact_name.ilike.${like},email.ilike.${like}`).limit(8),
      sb.from("projects").select("id,title,client_id,clients(business_name)").ilike("title", like).limit(8),
      sb.from("tickets").select("id,ticket_no,subject,status").ilike("subject", like).limit(8),
      isClient ? { data: [] as any[] } : sb.from("work_items").select("id,title,client_id,clients(business_name)").ilike("title", like).limit(8),
      isClient ? { data: [] as any[] } : sb.from("social_posts").select("id,title,caption,clients(business_name)").or(`title.ilike.${like},caption.ilike.${like}`).limit(8),
      isClient ? sb.from("invoices").select("id,period_label,invoice_no").ilike("period_label", like).limit(8) : { data: [] as any[] },
      isClient ? sb.from("documents").select("id,title").ilike("title", like).limit(8) : { data: [] as any[] },
    ]);
    const add = (name: string, hits: Hit[]) => hits.length && groups.push({ name, hits });
    add("Clients", (clients.data ?? []).map((c: any) => ({ href: `/clients/${c.id}`, title: c.business_name, sub: [c.contact_name, c.email].filter(Boolean).join(" · ") })));
    add("Projects", (projects.data ?? []).map((p: any) => ({ href: isClient ? "/" : `/clients/${p.client_id}?tab=projects`, title: p.title, sub: p.clients?.business_name })));
    add("Tickets", (tickets.data ?? []).map((t: any) => ({ href: `/tickets/${t.id}`, title: `${ticketRef(t.ticket_no)} ${t.subject}`, sub: statusLabel(t.status) })));
    add("Tasks", (tasks.data ?? []).map((w: any) => ({ href: `/clients/${w.client_id}?tab=work`, title: w.title, sub: w.clients?.business_name })));
    add("Content", (posts.data ?? []).map((p: any) => ({ href: `/studio/${p.id}`, title: p.title || (p.caption ?? "").slice(0, 70) || "Untitled", sub: p.clients?.business_name })));
    add("Invoices", (invoices.data ?? []).map((i: any) => ({ href: `/invoices/${i.id}`, title: i.period_label, sub: i.invoice_no ? `ANW-${String(i.invoice_no).padStart(4, "0")}` : undefined })));
    add("Documents", (docs.data ?? []).map((d: any) => ({ href: `/api/documents/${d.id}`, title: d.title })));
  }

  return (
    <Shell me={me}>
      <PageHead tag="Find" title="Search" sub={isClient ? "Your projects, tickets, invoices and documents." : "Clients, projects, tickets, tasks and content."} />
      <form role="search" className="mb-6 flex gap-2">
        <input name="q" defaultValue={term} autoFocus placeholder="Type at least 2 letters…" className="input" aria-label="Search" />
        <button className="btn-primary">Search</button>
      </form>
      {term.length < 2 ? <Empty>Start typing to search.</Empty> : groups.length === 0 ? <Empty>Nothing found for “{term}”.</Empty> : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.name}>
              <p className="tag mb-2">[ {g.name} · {g.hits.length} ]</p>
              <div className="space-y-2">
                {g.hits.map((h, i) => (
                  <Link key={i} href={h.href} className="row hover:border-forest/40"><span className="min-w-0 truncate font-medium">{h.title}</span>{h.sub && <span className="shrink-0 font-mono text-[11px] text-mute">{h.sub}</span>}</Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Shell>
  );
}
