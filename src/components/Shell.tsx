import Link from "next/link";
import { signOutAction } from "@/app/actions";
import type { Me } from "@/lib/supabase-server";
import { Logo } from "./Logo";
import { BottomNav, TopNav, type NavItem } from "./NavLinks";

const roleLabel: Record<string, string> = { admin: "Founder", manager: "Manager", developer: "Developer", client: "Client" };

export default function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const staff = me.role !== "client";
  const lead = me.role === "admin" || me.role === "manager";
  const items: NavItem[] = staff
    ? [
        { href: "/", label: "Clients", icon: "clients" },
        { href: "/approvals", label: "Approvals", icon: "approvals" },
        ...(lead ? [{ href: "/catalogue", label: "Services", icon: "catalogue" } as NavItem] : []),
        ...(me.role === "admin" ? [{ href: "/team", label: "Team", icon: "team" } as NavItem] : []),
      ]
    : [];
  const initial = (me.full_name || me.email || "A").trim()[0]?.toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-edge bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Anweo home"><Logo /></Link>
          <TopNav items={items} />
          <div className="flex items-center gap-2.5">
            <div className="hidden text-right leading-tight sm:block">
              <p className="max-w-[160px] truncate text-sm font-semibold">{me.full_name || me.email}</p>
              <p className="tag !text-[9.5px] !text-forest">{roleLabel[me.role]}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime text-sm font-bold text-ink">{initial}</span>
            <form action={signOutAction}><button className="btn-ghost !px-3 !py-1.5 text-xs">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className={`mx-auto max-w-5xl px-4 pt-6 sm:px-6 ${staff ? "pb-28 md:pb-16" : "pb-16"}`}>{children}</main>
      {staff && <BottomNav items={items} />}
    </div>
  );
}

export const money = (n: number | string, cur = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(Number(n));

export const statusPill = (s: string) => {
  const good = "bg-lime-soft text-forest";
  const prog = "bg-forest-soft text-forest";
  const warn = "bg-amber-100 text-amber-800";
  const bad = "bg-red-50 text-red-700";
  const map: Record<string, string> = {
    done: good, posted: good, paid: good, active: good,
    in_progress: prog, scheduled: prog, approved: prog,
    review: warn, awaiting_approval: warn, due: warn, paused: warn, pending: warn,
    overdue: bad, rejected: bad, cancelled: bad, disabled: bad, void: bad,
  };
  return map[s] ?? "bg-charcoal/10 text-charcoal";
};
export const label = (s: string) => s.replace(/_/g, " ");

export function PageHead({ tag, title, sub, children }: { tag?: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {tag && <p className="tag mb-1.5">[ {tag} ]</p>}
        <h1 className="text-3xl font-bold leading-none tracking-tight sm:text-4xl">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-sm text-mute">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-edge px-4 py-6 text-center text-sm text-mute">{children}</p>;
}
