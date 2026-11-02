"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { sendMessageAction } from "@/app/actions";

export type Msg = { id: string; sender_id: string; sender_name: string | null; sender_role: string; body: string; created_at: string };

const time = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ChatBox({ clientId, meId, meIsClient, messages }: { clientId: string | null; meId: string; meIsClient: boolean; messages: Msg[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  // Live updates: refresh when a new message arrives, plus a slow poll as a safety net.
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb
      .channel("chat-" + (clientId ?? "team"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p: { new: { client_id: string | null } }) => {
        if ((p.new.client_id ?? null) === clientId) router.refresh();
      })
      .subscribe();
    const t = setInterval(() => router.refresh(), 20000);
    return () => { sb.removeChannel(ch); clearInterval(t); };
  }, [clientId, router]);

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setError("");
    start(async () => {
      const fd = new FormData();
      fd.set("client_id", clientId ?? "");
      fd.set("body", body);
      const r = await sendMessageAction(fd);
      if (r?.error) { setError(r.error); return; }
      setText("");
      router.refresh();
    });
  }

  return (
    <div className="flex h-[calc(100dvh-23rem)] min-h-[340px] lg:h-[calc(100dvh-19rem)] flex-col overflow-hidden rounded-xl2 border border-edge bg-white shadow-card">
      <div className="flex-1 space-y-3 overflow-y-auto bg-paper/50 p-4">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-mute">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          // Clients see staff as "Anweo team"; staff see real names.
          const name = mine ? "You" : meIsClient && m.sender_role !== "client" ? `${m.sender_name || "Anweo"} · Anweo team` : m.sender_name || "Unknown";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "rounded-br-md bg-forest text-paper" : "rounded-bl-md border border-edge bg-white"}`}>
                <p className={`mb-0.5 font-mono text-[10px] uppercase tracking-wider ${mine ? "text-lime" : "text-mute"}`}>{name} · {time(m.created_at)}</p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t border-edge bg-white p-3">
        {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            maxLength={4000}
            placeholder="Write a message"
            className="input max-h-32 min-h-[44px] resize-none"
            aria-label="Message"
          />
          <button className="btn-primary !px-5" disabled={pending || !text.trim()}>{pending ? "…" : "Send"}</button>
        </div>
      </form>
    </div>
  );
}
