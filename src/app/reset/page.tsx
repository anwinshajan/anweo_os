"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Logo } from "@/components/Logo";

// Landing page for the link in the reset email: it signs the person in for this one purpose, then they choose a new password.
export default function ResetPage() {
  const [ready, setReady] = useState<"checking" | "ok" | "bad">("checking");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) { setReady("bad"); return; }
        window.history.replaceState({}, "", "/reset");
      }
      const { data } = await sb.auth.getSession();
      setReady(data.session ? "ok" : "bad");
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== again) return setError("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    if (error) { setBusy(false); return setError(error.message); }
    window.location.href = "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8"><Logo size={36} /></div>
        <p className="tag mb-2">[ New password ]</p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight">Choose a new password</h1>
        {ready === "checking" && <p className="text-sm text-mute">Checking your link…</p>}
        {ready === "bad" && (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">This link has expired or was opened in a different browser than the one you asked from. Please request a new one.</p>
            <Link href="/forgot" className="btn-primary block w-full text-center !py-3">Send a new link</Link>
          </div>
        )}
        {ready === "ok" && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="pw">New password</label>
              <input id="pw" type="password" required minLength={10} autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-mute">At least 10 characters.</p>
            </div>
            <div>
              <label className="label" htmlFor="pw2">Repeat it</label>
              <input id="pw2" type="password" required autoComplete="new-password" className="input" value={again} onChange={(e) => setAgain(e.target.value)} />
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? "Saving…" : "Save and sign in"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
