"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "@/components/Toaster";

type Result = { error?: string } | undefined | void;

// While a form is submitting this marks it busy (CSS dims and locks its buttons, so nothing is double-submitted).
function Busy() {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const f = ref.current?.closest("form");
    if (!f) return;
    if (pending) f.setAttribute("data-busy", ""); else f.removeAttribute("data-busy");
  }, [pending]);
  return <span ref={ref} hidden />;
}

// A <form> that runs a server action, shows its error (if any) as a toast, and confirms success.
export default function Form({ action, className, children, quiet }: { action: (fd: FormData) => Promise<Result>; className?: string; children: ReactNode; quiet?: boolean }) {
  return (
    <form
      className={className}
      action={async (fd: FormData) => {
        const r = await action(fd);
        if (r && r.error) toast(r.error, "error");
        else if (!quiet) toast("Saved");
      }}
    >
      <Busy />
      {children}
    </form>
  );
}
