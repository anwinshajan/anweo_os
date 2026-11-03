"use client";
import { useState } from "react";

// A date-and-time picker that works in the person's own time zone and sends an exact moment (ISO) to the server.
export default function LocalDateTime({ name, defaultIso, className = "input" }: { name: string; defaultIso?: string | null; className?: string }) {
  const toLocal = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const [v, setV] = useState(defaultIso ? toLocal(defaultIso) : "");
  return (
    <>
      <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} className={className} aria-label="Date and time" />
      <input type="hidden" name={name} value={v ? new Date(v).toISOString() : ""} />
    </>
  );
}
