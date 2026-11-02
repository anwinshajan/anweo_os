"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Corner, Logo } from "@/components/Logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError("That email or password isn't right. Please try again.");
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative flex min-h-[260px] flex-col justify-between overflow-hidden bg-forest p-7 text-paper sm:p-10 lg:min-h-screen">
        <Corner className="absolute -left-2 -top-2 h-36 w-36 text-forest-deep sm:h-48 sm:w-48" />
        <Corner className="absolute -bottom-2 -right-2 h-36 w-36 rotate-180 text-forest-deep sm:h-48 sm:w-48" />
        <div className="relative"><Logo onDark size={38} /></div>
        <div className="relative max-w-md">
          <p className="tag mb-3 !text-lime">[ Everything digital ]</p>
          <h1 className="text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl">Filmed, designed<br />and posted.</h1>
          <p className="mt-4 hidden text-sm text-paper/70 sm:block">Your services, content calendar and billing, all in one place.</p>
        </div>
        <p className="tag relative hidden !text-paper/50 lg:block">India · United Kingdom</p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <p className="tag mb-2">[ Sign in ]</p>
          <h2 className="mb-6 text-3xl font-bold tracking-tight">Welcome back</h2>
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </div>
          <p className="mt-6 text-sm text-mute">Accounts are created by the Anweo team. Need access? Contact your account manager.</p>
        </form>
      </section>
    </main>
  );
}
