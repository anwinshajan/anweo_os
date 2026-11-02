"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: "clients" | "approvals" | "catalogue" | "team" };

const icons: Record<NavItem["icon"], React.ReactNode> = {
  clients: <path d="M4 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 9v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6" />,
  approvals: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  catalogue: <path d="M4 7.5 12 4l8 3.5M4 7.5 12 11m-8-3.5V16l8 4m0-9v9m0-9 8-3.5M20 7.5V16l-8 4" />,
  team: <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM5 20a7 7 0 0 1 14 0" />,
};

function Icon({ name }: { name: NavItem["icon"] }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/clients") : path.startsWith(href));

export function TopNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            isActive(path, i.href) ? "bg-forest text-paper" : "text-ink/70 hover:bg-forest-soft hover:text-forest"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md justify-around px-2 py-1.5">
        {items.map((i) => {
          const on = isActive(path, i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} className={`flex min-w-[64px] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-medium ${on ? "text-forest" : "text-mute"}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${on ? "bg-lime" : ""}`}>
                  <Icon name={i.icon} />
                </span>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
