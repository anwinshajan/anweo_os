import Link from "next/link";
import { signOutAction } from "@/app/actions";
import type { Me } from "@/lib/supabase-server";
import { roleLabel, isAdminRole, isLeadRole } from "@/lib/roles";
import { formatMoney } from "@/lib/currency";
import { Logo } from "./Logo";
import { BottomNav, TopNav, type NavItem } from "./NavLinks";

// Everything a person can open, by role. Used for the desktop menu and the "More" page.
export function navFor(me: Me): NavItem[] {
  if (me.role === "client") {
    return [
      { href: "/", label: "Home", icon: "home" },
      { href: "/chat", label: "Chat", icon: "chat" },
      { href: "/chat/ai", label: "Anweo AI", icon: "ai" },
      { href: "/account", label: "Account", icon: "account" },
    ];
  }
  const lead = isLeadRole(me.role);
  const admin = isAdminRole(me.role);
  return [
    { href: "/", label: "Clients", icon: "clients" },
    { href: "/tasks", label: "Tasks", icon: "tasks" },
    { href: "/chat", label: "Chat", icon: "chat" },
    { href: "/approvals", label: "Approvals", icon: "approvals" },
    ...(lead ? [{ href: "/catalogue", label: "Services", icon: "catalogue" } as NavItem] : []),
    ...(admin ? [{ href: "/finance", label: "Finance", icon: "finance" } as NavItem] : []),
    ...(admin ? [{ href: "/team", label: "Team", icon: "team" } as NavItem] : []),
    ...(admin ? [{ href: "/settings", label: "Settings", icon: "settings", more: true } as NavItem] : []),
    ...(!admin ? [{ href: "/pay", label: "My pay", icon: "pay" } as NavItem] : []),
  ];
}

export default function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const staff = me.role !== "client";
  const all = navFor(me);
  const bottom: NavItem[] = staff
    ? [
        { href: "/", label: "Clients", icon: "clients" },
        { href: "/tasks", label: "Tasks", icon: "tasks" },
        { href: "/chat", label: "Chat", icon: "chat" },
        { href: "/approvals", label: "Approvals", icon: "approvals" },
        { href: "/more", label: "More", icon: "more" },
      ]
    : all;
  const initial = (me.full_name || me.email || "A").trim()[0]?.toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-edge bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Anweo home"><Logo /></Link>
          <TopNav items={all.filter((i) => !i.more)} />
          <div className="flex items-center gap-2.5">
            <Link href="/account" className="flex items-center gap-2.5" aria-label="My account">
              <div className="hidden text-right leading-tight sm:block">
                <p className="max-w-[160px] truncate text-sm font-semibold">{me.full_name || me.email}</p>
                <p className="tag !text-[9.5px] !text-forest">{me.job_title || roleLabel[me.role]}</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime text-sm font-bold text-ink">{initial}</span>
            </Link>
            <form action={signOutAction}><button className="btn-ghost !px-3 !py-1.5 text-xs">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-16">{children}</main>
      <BottomNav items={bottom} />
    </div>
  );
}

export const money = (n: number | string, cur = "GBP") => formatMoney(n, cur);

export const statusPill = (s: string) => {
  const good = "bg-lime-soft text-forest";
  const prog = "bg-forest-soft text-forest";
  const warn = "bg-amber-100 text-amber-800";
  const bad = "bg-red-50 text-red-700";
  const map: Record<string, string> = {
    done: good, posted: good, paid: good, active: good, completed: good, signed: good,
    in_progress: prog, scheduled: prog, approved: prog, sent: prog, planning: prog,
    review: warn, awaiting_approval: warn, due: warn, paused: warn, pending: warn, on_hold: warn,
    overdue: bad, rejected: bad, cancelled: bad, disabled: bad, void: bad, archived: bad,
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

export const fmtDate = (d: string | null | undefined, withTime = false) =>
  d ? new Date(d).toLocaleString("en-GB", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }) : "";

// Group amounts by currency so GBP and INR are never added together.
export function totals(rows: { amount?: number | string; price_monthly?: number | string; currency: string }[]) {
  const t: Record<string, number> = {};
  for (const r of rows) t[r.currency] = (t[r.currency] ?? 0) + Number(r.amount ?? r.price_monthly ?? 0);
  return t;
}
const byCurrency = (t: Record<string, number>) =>
  Object.keys(t).sort((a, b) => (a === "GBP" ? -1 : b === "GBP" ? 1 : a.localeCompare(b)));

// One line of text, currencies kept apart: "£150.00 · ₹42,000.00". Nothing is converted or added together.
export const showTotals = (t: Record<string, number>) => {
  const keys = byCurrency(t);
  return keys.length === 0 ? money(0) : keys.map((c) => money(t[c], c)).join(" · ");
};

// Each currency on its own line. Use this for big numbers.
export function Totals({ t, className = "", empty }: { t: Record<string, number>; className?: string; empty?: string }) {
  const keys = byCurrency(t);
  if (keys.length === 0) return <div className={className}>{empty ?? money(0)}</div>;
  return (
    <div className={className}>
      {keys.map((c) => <div key={c}>{money(t[c], c)}</div>)}
    </div>
  );
}
