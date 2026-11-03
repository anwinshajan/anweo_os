"use client";
import { useEffect, useState } from "react";
import { savePushSubscriptionAction, removePushSubscriptionAction } from "@/app/actions";
import { toast } from "@/components/Toaster";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

// Turn notifications on or off for this device. On iPhone this only works once the app is on the home screen.
export default function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "needs-install" : "unsupported");
      if (!PUBLIC_KEY) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(sub && Notification.permission === "granted" ? "on" : "off");
      } catch { setState("unsupported"); }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const j = sub.toJSON();
      const fd = new FormData();
      fd.set("endpoint", sub.endpoint);
      fd.set("p256dh", j.keys?.p256dh ?? "");
      fd.set("auth", j.keys?.auth ?? "");
      fd.set("ua", navigator.userAgent.slice(0, 200));
      const r = await savePushSubscriptionAction(fd);
      if (r?.error) { toast(r.error, "error"); return; }
      setState("on");
      toast("Notifications are on for this device");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not turn notifications on", "error");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const fd = new FormData(); fd.set("endpoint", sub.endpoint);
        await removePushSubscriptionAction(fd);
        await sub.unsubscribe();
      }
      setState("off");
    } finally { setBusy(false); }
  }

  if (state === "loading") return null;
  if (compact && (state === "on" || state === "unsupported")) return null;

  const msg: Record<State, string> = {
    loading: "",
    unsupported: "This browser can't receive push notifications.",
    "needs-install": "On iPhone, add Anweo to your home screen first (Share → Add to Home Screen), then open it from there to turn notifications on.",
    blocked: "Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.",
    off: "Get alerts for messages, tasks, approvals and invoices, even when the app is closed.",
    on: "Notifications are on for this device.",
  };

  return (
    <div className={compact ? "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lime bg-lime-soft px-4 py-3 text-sm" : "flex flex-wrap items-center justify-between gap-3"}>
      <p className={compact ? "min-w-0 flex-1 text-forest" : "min-w-0 flex-1 text-sm text-ink/80"}>{msg[state]}</p>
      {state === "off" && <button onClick={enable} disabled={busy} className="btn-primary !py-2">{busy ? "Turning on…" : "Turn on notifications"}</button>}
      {state === "on" && !compact && <button onClick={disable} disabled={busy} className="btn-ghost !py-2">Turn off</button>}
    </div>
  );
}
