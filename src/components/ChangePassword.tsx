"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function ChangePassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 10) return setMsg({ ok: false, text: "Use at least 10 characters." });
    if (pw !== pw2) return setMsg({ ok: false, text: "The two passwords don't match." });
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setPw(""); setPw2("");
    setMsg({ ok: true, text: "Password changed." });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="np">New password</label><input id="np" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <div><label className="label" htmlFor="np2">Repeat it</label><input id="np2" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
      {msg && <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm sm:col-span-2 ${msg.ok ? "bg-lime-soft text-forest" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Change password"}</button></div>
    </form>
  );
}
