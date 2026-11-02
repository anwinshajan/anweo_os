"use client";
import { Logo } from "@/components/Logo";

// Friendly fallback when an action fails (for example a validation message from the server).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 text-center">
      <div className="mx-auto"><Logo /></div>
      <div className="card">
        <p className="tag mb-2">[ Something went wrong ]</p>
        <p className="text-sm text-ink/80">{process.env.NODE_ENV === "production" ? "That didn't work. Please go back and try again." : error.message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">Try again</button>
          <a href="/" className="btn-ghost">Home</a>
        </div>
      </div>
    </main>
  );
}
