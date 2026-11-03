"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logProspectActivityAction } from "@/app/actions";
import { TEMPLATES, fillTemplate, waLink } from "@/lib/sales";
import { toast } from "@/components/Toaster";

// Pick a message, tweak it, then send it over WhatsApp or email. Sending is logged on the timeline automatically.
export default function PitchBox({ suggested, id, phone, email, contact, business, me, country }: { suggested?: string; id: string; phone: string | null; email: string | null; contact: string | null; business: string; me: string; country: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tpl, setTpl] = useState(TEMPLATES.some((t) => t.id === suggested) ? suggested! : TEMPLATES[0].id);
  const fill = (t: string) => fillTemplate(TEMPLATES.find((x) => x.id === t)!.body, { contact, business, me });
  const [text, setText] = useState(() => fill(TEMPLATES.some((t) => t.id === suggested) ? suggested! : TEMPLATES[0].id));
  const wa = waLink(phone, text, country);

  function log(kind: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("id", id); fd.set("kind", kind); fd.set("body", text);
      const r = await logProspectActivityAction(fd);
      if (r?.error) toast(r.error, "error"); else router.refresh();
    });
  }

  return (
    <div className="card">
      <p className="tag mb-3">[ Reach out ]</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" onClick={() => { setTpl(t.id); setText(fill(t.id)); }} className={`pill ${tpl === t.id ? "bg-forest text-lime" : "bg-forest-soft text-forest"}`}>{t.name}</button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="input" aria-label="Message" />
      <div className="mt-3 flex flex-wrap gap-2">
        {wa ? <a href={wa} target="_blank" rel="noreferrer" onClick={() => log("whatsapp")} className="btn-primary">Send on WhatsApp</a> : <span className="btn-ghost cursor-not-allowed opacity-50" title="Add a valid phone number first">WhatsApp</span>}
        {email && <a href={`mailto:${email}?subject=${encodeURIComponent(`Helping ${business} grow online`)}&body=${encodeURIComponent(text)}`} onClick={() => log("email")} className="btn-ghost">Email</a>}
        {phone && <a href={`tel:${phone}`} onClick={() => log("call")} className="btn-ghost">Call</a>}
        <button type="button" className="btn-ghost" disabled={pending} onClick={async () => { try { await navigator.clipboard.writeText(text); toast("Copied. Paste it into Instagram or anywhere else"); log("dm"); } catch { toast("Couldn't copy", "error"); } }}>Copy for DM</button>
      </div>
    </div>
  );
}
