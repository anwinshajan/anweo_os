"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { sendMessageAction } from "@/app/actions";

export type Person = { id: string; name: string; role: string };
export type Msg = { id: string; sender_id: string; sender_name: string | null; sender_role: string; body: string; created_at: string };

function renderBody(body: string, people: Person[], mine: boolean) {
  const names = [...people.map((p) => p.name)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length || !body.includes("@")) return body;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return body.split(new RegExp(`(@(?:${esc}))`, "g")).map((part, i) =>
    i % 2 ? <span key={i} className={`rounded px-1 font-semibold ${mine ? "bg-lime/25 text-lime" : "bg-forest/10 text-forest"}`}>{part}</span> : part
  );
}

const time = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ChatBox({ clientId, meId, meIsClient, messages, recipientId = null, people = [], meName = "" }: { clientId: string | null; meId: string; meIsClient: boolean; messages: Msg[]; recipientId?: string | null; people?: Person[]; meName?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [picked, setPicked] = useState<Person[]>([]);
  const [query, setQuery] = useState<string | null>(null); // text after the "@" being typed, or null
  const [sel, setSel] = useState(0);
  const options = query === null ? [] : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function onChange(v: string, caret: number) {
    setText(v);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(v.slice(0, caret));
    setQuery(m && people.length ? m[2] : null);
    setSel(0);
  }
  function choose(p: Person) {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@[^\s@]*$/, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setPicked((x) => (x.some((y) => y.id === p.id) ? x : [...x, p]));
    setQuery(null);
    requestAnimationFrame(() => { ta?.focus(); ta?.setSelectionRange(before.length, before.length); });
  }

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  // Live updates: refresh when a new message arrives, plus a slow poll as a safety net.
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb
      .channel("chat-" + (recipientId ?? clientId ?? "team"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p: { new: { client_id: string | null; recipient_id: string | null; sender_id: string } }) => {
        const n = p.new;
        const hit = recipientId ? (n.sender_id === recipientId && n.recipient_id === meId) || (n.sender_id === meId && n.recipient_id === recipientId)
          : !n.recipient_id && (n.client_id ?? null) === clientId;
        if (hit) router.refresh();
      })
      .subscribe();
    const t = setInterval(() => router.refresh(), 20000);
    return () => { sb.removeChannel(ch); clearInterval(t); };
  }, [clientId, recipientId, meId, router]);

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setError("");
    start(async () => {
      const fd = new FormData();
      fd.set("client_id", clientId ?? "");
      fd.set("body", body);
      if (recipientId) fd.set("recipient_id", recipientId);
      // Only names still present in the text count as mentions.
      fd.set("mentions", JSON.stringify(picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id)));
      const r = await sendMessageAction(fd);
      if (r?.error) { setError(r.error); return; }
      setText(""); setPicked([]); setQuery(null);
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
                <p className="whitespace-pre-wrap break-words">{renderBody(m.body, [...people, ...(meName ? [{ id: meId, name: meName, role: "" }] : [])], mine)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t border-edge bg-white p-3">
        {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
          {options.length > 0 && (
            <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-edge bg-white shadow-card">
              {options.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === sel}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(p); }} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === sel ? "bg-forest/10" : ""}`}>
                    <span className="truncate font-medium">{p.name}</span><span className="font-mono text-[10px] uppercase text-mute">{p.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
            onKeyDown={(e) => {
              if (options.length) {
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((x) => (x + 1) % options.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setSel((x) => (x - 1 + options.length) % options.length); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(options[sel]); return; }
                if (e.key === "Escape") { setQuery(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={1}
            maxLength={4000}
            placeholder={people.length ? "Write a message. Type @ to mention someone" : "Write a message"}
            className="input max-h-32 min-h-[44px] w-full resize-none"
            aria-label="Message"
          />
          </div>
          <button className="btn-primary !px-5" disabled={pending || !text.trim()}>{pending ? "…" : "Send"}</button>
        </div>
      </form>
    </div>
  );
}
