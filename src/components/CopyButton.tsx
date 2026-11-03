"use client";
import { toast } from "@/components/Toaster";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={async () => {
      try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Couldn't copy. Select it and copy manually.", "error"); }
    }}>{label}</button>
  );
}
