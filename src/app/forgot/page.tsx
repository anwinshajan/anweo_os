"use client";
import Link from "next/link";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Logo } from "@/components/Logo";

// Sends a reset link by email. The answer is always the same, so nobody can use this page to find out who has an account.
export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
    setBusy(false);
    // Rate limits are worth telling people about; everything else looks like success.
    if (error && /rate|seconds|too many/i.test(error.message)) { setError("Too many requests. Please wait a minute and try again."); return; }
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8"><Logo size={36} /></div>
        <p className="tag mb-2">[ Reset password ]</p>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Forgot your password?</h1>
        {sent ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-forest-soft px-3.5 py-3 text-sm text-forest">If that email belongs to an Anweo account, a reset link is on its way. Open it on this same device and browser. It can take a minute, and the link expires after an hour.</p>
            <Link href="/login" className="btn-ghost block w-full text-center !py-3">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-mute">Enter your account email and we'll send you a link to choose a new password.</p>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
            <Link href="/login" className="block text-center text-sm text-mute hover:text-forest">Back to sign in</Link>
          </form>
        )}
      </div>
    </main>
  );
}
