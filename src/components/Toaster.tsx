"use client";
import { useEffect, useState } from "react";

type T = { id: number; text: string; kind: "ok" | "error" };
let n = 0;
export function toast(text: string, kind: "ok" | "error" = "ok") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("anweo-toast", { detail: { id: ++n, text, kind: kind === "error" ? "error" : "ok" } }));
}

export default function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<T>).detail;
      setItems((x) => [...x.slice(-2), t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.kind === "error" ? 6000 : 1800);
    };
    window.addEventListener("anweo-toast", on);
    return () => window.removeEventListener("anweo-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-8" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast-in pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium shadow-lift ${t.kind === "error" ? "bg-red-700 text-white" : "bg-ink text-paper"}`}>{t.text}</div>
      ))}
    </div>
  );
}
