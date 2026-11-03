"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type IconName = "clients" | "approvals" | "catalogue" | "team" | "chat" | "tasks" | "more" | "home" | "ai" | "account" | "finance" | "pay" | "settings" | "transactions" | "clock" | "studio";
export type NavItem = { href: string; label: string; icon: IconName; more?: boolean };

const icons: Record<IconName, React.ReactNode> = {
  clients: <path d="M4 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 9v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6" />,
  approvals: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  catalogue: <path d="M4 7.5 12 4l8 3.5M4 7.5 12 11m-8-3.5V16l8 4m0-9v9m0-9 8-3.5M20 7.5V16l-8 4" />,
  team: <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM5 20a7 7 0 0 1 14 0" />,
  chat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  tasks: <path d="M9 6h11M9 12h11M9 18h11M4.5 6l1 1 1.8-2M4.5 12l1 1 1.8-2M4.5 18l1 1 1.8-2" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
  home: <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1v-8Z" />,
  ai: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3L8.5 12l2.3-1.2L12 8.5Z" />,
  account: <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM5 20a7 7 0 0 1 14 0" />,
  finance: <path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" />,
  settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-5v2m0 12v2M4 12h2m12 0h2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4M7.7 16.3l-1.4 1.4" />,
  transactions: <path d="M7 4 3.5 7.5M3.5 7.5H15M3.5 7.5 7 11M17 13l3.5 3.5M20.5 16.5H9M20.5 16.5 17 20" />,
  clock: <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  studio: <path d="M4 5h16v11H4V5Zm4 14h8M12 16v3M9 9.5l2 2 3.5-3.5" />,
  pay: <path d="M3 8h18v10H3V8Zm0 3h18M7 15h3M6 5h12" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

const isActive = (path: string, href: string) =>
  href === "/" ? path === "/" || path.startsWith("/clients") : path === href || path.startsWith(href + "/");

export function TopNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md justify-around px-1 py-1.5">
        {items.map((i) => {
          const on = isActive(path, i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} className={`flex min-w-[62px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium ${on ? "text-forest" : "text-mute"}`}>
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
