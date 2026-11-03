import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

// The notification bell with its unread count. Loads on its own so it never slows the page down.
export default async function Bell() {
  const sb = await supabaseServer();
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const n = count ?? 0;
  return (
    <Link href="/notifications" aria-label={n ? `${n} unread notifications` : "Notifications"} className="relative flex h-9 w-9 items-center justify-center rounded-full border border-edge bg-white text-ink/70 hover:border-forest/40">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Zm4 9.5a2 2 0 0 0 4 0" /></svg>
      {n > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{n > 9 ? "9+" : n}</span>}
    </Link>
  );
}
