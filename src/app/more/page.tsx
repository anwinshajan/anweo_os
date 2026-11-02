import Link from "next/link";
import { redirect } from "next/navigation";
import Shell, { PageHead, navFor } from "@/components/Shell";
import { Icon } from "@/components/NavLinks";
import { getMe } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function More() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/");
  const items = [...navFor(me), { href: "/chat/ai", label: "Anweo AI", icon: "ai" as const }, { href: "/account", label: "My account", icon: "account" as const }]
    .filter((i, idx, arr) => arr.findIndex((x) => x.href === i.href) === idx);
  return (
    <Shell me={me}>
      <PageHead tag="Menu" title="Everything" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="card flex flex-col gap-3 !p-4 transition hover:-translate-y-0.5 hover:border-forest/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-soft text-forest"><Icon name={i.icon} /></span>
            <span className="font-semibold">{i.label}</span>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
