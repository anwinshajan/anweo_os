import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 text-center">
      <div className="mx-auto"><Logo /></div>
      <div className="card">
        <p className="tag mb-2">[ 404 ]</p>
        <h1 className="text-2xl font-bold">We can't find that page</h1>
        <Link href="/" className="btn-primary mt-5">Back to Anweo</Link>
      </div>
    </main>
  );
}
