"use client";
import { useEffect, useRef, useState } from "react";

type M = { role: "user" | "assistant"; content: string };

export default function AiChat({ initial, suggestions }: { initial: M[]; suggestions: string[] }) {
  const [msgs, setMsgs] = useState<M[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length, busy]);

  async function ask(q: string) {
    const message = q.trim();
    if (!message || busy) return;
    setError("");
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setError("Couldn't reach Anweo AI. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-23rem)] min-h-[340px] lg:h-[calc(100dvh-19rem)] flex-col overflow-hidden rounded-xl2 border border-edge bg-white shadow-card">
      <div className="flex-1 space-y-3 overflow-y-auto bg-paper/50 p-4">
        {msgs.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-mute">Ask me anything about your account, services or how Anweo works.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => ask(s)} className="btn-ghost !py-1.5 text-xs">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === "user" ? "rounded-br-md bg-forest text-paper" : "rounded-bl-md border border-edge bg-white"}`}>
              {m.role === "assistant" && <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-forest">Anweo AI</p>}
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          </div>
        ))}
        {busy && <p className="font-mono text-xs text-mute">Anweo AI is thinking…</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="border-t border-edge bg-white p-3">
        {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }}
            rows={1}
            maxLength={2000}
            placeholder="Ask Anweo AI"
            className="input max-h-32 min-h-[44px] resize-none"
            aria-label="Ask Anweo AI"
          />
          <button className="btn-lime !px-5" disabled={busy || !text.trim()}>Ask</button>
        </div>
      </form>
    </div>
  );
}
