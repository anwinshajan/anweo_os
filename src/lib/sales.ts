// Anweo's own sales system: stages, opportunity scoring, message templates, lead search and CSV import.

export const STAGES = [
  { id: "new", label: "New", hint: "Found, not contacted yet" },
  { id: "contacted", label: "Contacted", hint: "First message sent" },
  { id: "replied", label: "Replied", hint: "They answered" },
  { id: "meeting", label: "Meeting", hint: "Call or visit booked" },
  { id: "proposal", label: "Proposal", hint: "Quote sent" },
  { id: "won", label: "Won", hint: "Became a client" },
  { id: "lost", label: "Lost", hint: "Not interested" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];
export const stageLabel = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s;
export const isStage = (s: string): s is StageId => STAGES.some((x) => x.id === s);

export const SOURCES = ["manual", "csv", "referral", "instagram", "walk-in", "other"];
export const SERVICES = ["Social media management", "Website", "Branding & logo", "Video / reels", "Paid ads", "SEO", "E-commerce", "Other"];

// How good a target is for a marketing agency (0 to 100): no website, thin online presence and
// weak reviews mean they need us. It is a guide for ordering the list, not a verdict.
export function opportunityScore(p: { website?: string | null; instagram?: string | null; phone?: string | null; rating?: number | null; review_count?: number | null }) {
  let s = 20;
  if (!p.website) s += 30;
  if (!p.instagram) s += 10;
  if (p.phone) s += 10;
  if (p.review_count != null && p.review_count < 30) s += 15;
  if (p.rating != null && p.rating < 4.2) s += 15;
  return Math.min(100, s);
}
export const scoreLabel = (n: number) => (n >= 70 ? "Hot" : n >= 45 ? "Warm" : "Cool");

export function whyThem(p: { website?: string | null; instagram?: string | null; rating?: number | null; review_count?: number | null }) {
  const out: string[] = [];
  if (!p.website) out.push("no website");
  if (!p.instagram) out.push("no Instagram found");
  if (p.review_count != null && p.review_count < 30) out.push(`only ${p.review_count} reviews`);
  if (p.rating != null && p.rating < 4.2) out.push(`${p.rating}★ rating`);
  return out;
}

// Turn a phone number into a wa.me link. UK numbers (07…) and Indian numbers (10 digits) are handled.
export function waLink(phone: string | null | undefined, text: string, country = "United Kingdom") {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = (country.toLowerCase().includes("india") ? "91" : "44") + d.slice(1);
  else if (d.length === 10 && country.toLowerCase().includes("india")) d = "91" + d;
  if (d.length < 8 || d.length > 15) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export type Template = { id: string; name: string; body: string };
export const TEMPLATES: Template[] = [
  { id: "intro", name: "First hello", body: "Hi {contact}, this is {me} from Anweo, a digital marketing agency. I came across {business} and think we could help you get more customers online. Would you be open to a quick chat this week?" },
  { id: "nosite", name: "No website", body: "Hi {contact}, I noticed {business} doesn't have a website yet, so people searching for you can't find you easily. I'm {me} from Anweo. We build simple, quick sites for local businesses. Can I show you an example?" },
  { id: "social", name: "Social media", body: "Hi {contact}, I'm {me} from Anweo. We look after Instagram and Facebook for businesses like {business}: posts, reels and ads, all handled for you. Would you like a free idea for your next month of content?" },
  { id: "followup", name: "Follow-up", body: "Hi {contact}, just following up on my last message about {business}. Happy to keep it short. Is now a good time for a 10 minute call?" },
  { id: "meeting", name: "Book a call", body: "Hi {contact}, thanks for coming back to me. Could we have a quick 15 minute call about {business}? I'm free tomorrow morning or afternoon, whichever suits you." },
  { id: "chase", name: "Chase proposal", body: "Hi {contact}, I wanted to check you received the proposal for {business}. Do you have any questions? I'm happy to adjust anything, or start with a smaller package. {me}, Anweo" },
  { id: "proposal", name: "After meeting", body: "Hi {contact}, great speaking with you. As promised, I'm sending the proposal for {business}. Let me know what you think and I'll adjust anything you like. {me}, Anweo" },
];
export const fillTemplate = (t: string, v: { contact?: string | null; business: string; me: string }) =>
  t.replaceAll("{contact}", v.contact?.split(" ")[0] || "there").replaceAll("{business}", v.business).replaceAll("{me}", v.me);

// ---- CSV import: first row is the header. Understands common column names.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  business_name: ["business", "business name", "name", "company", "company name", "title"],
  contact_name: ["contact", "contact name", "owner", "person"],
  phone: ["phone", "mobile", "tel", "telephone", "whatsapp", "number"],
  email: ["email", "e-mail", "mail"],
  website: ["website", "site", "url", "web"],
  instagram: ["instagram", "insta", "ig"],
  address: ["address", "location"],
  city: ["city", "town"],
  category: ["category", "type", "industry"],
  notes: ["notes", "note", "comments"],
};
export type CsvProspect = { business_name: string; contact_name?: string; phone?: string; email?: string; website?: string; instagram?: string; address?: string; city?: string; category?: string; notes?: string };
export function csvToProspects(text: string): CsvProspect[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const i = head.findIndex((h) => names.includes(h));
    if (i >= 0) idx[field] = i;
  }
  if (idx.business_name === undefined) return [];
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    for (const [f, i] of Object.entries(idx)) { const v = (r[i] ?? "").trim(); if (v) o[f] = v.slice(0, 500); }
    return o as CsvProspect;
  }).filter((p) => p.business_name);
}


export const norm = {
  phone: (v?: string | null) => (v ? v.replace(/\D/g, "").slice(-10) : ""),
  name: (v?: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""),
};
// Two prospects are the same business if they share a phone number, or the same name in the same city.
export const dupeKeys = (p: { phone?: string | null; business_name: string; city?: string | null }) => {
  const k: string[] = [];
  if (norm.phone(p.phone).length >= 7) k.push("p:" + norm.phone(p.phone));
  k.push("n:" + norm.name(p.business_name) + "|" + norm.name(p.city));
  return k;
};

// ---- the import format
export const CSV_COLUMNS = ["Business name", "Contact name", "Phone", "Email", "Website", "Instagram", "City", "Category", "Notes"];
export const CSV_TEMPLATE = CSV_COLUMNS.join(",") + '\n"Joe\'s Barbers","Joe Smith","07700 900123","joe@example.com","","joesbarbers","Derby","Barber","Met at the market"\n';

// ---- closing help
const DAY = 864e5;
export const WIN_CHANCE: Record<string, number> = { new: 0.05, contacted: 0.1, replied: 0.25, meeting: 0.45, proposal: 0.65, won: 1, lost: 0 };
// Days until the next follow-up when a prospect enters a stage.
export const FOLLOW_UP_DAYS: Record<string, number | null> = { new: 0, contacted: 3, replied: 1, meeting: 2, proposal: 3, won: null, lost: null };

export type Next = { title: string; why: string; template?: string; tone: "urgent" | "normal" | "calm" };
export function nextAction(p: { status: string; phone?: string | null; website?: string | null; next_follow_up?: string | null; last_touch_at?: string | null; est_value?: number | null }, today: string): Next {
  const idle = p.last_touch_at ? Math.floor((Date.now() - new Date(p.last_touch_at).getTime()) / DAY) : 0;
  const overdue = !!p.next_follow_up && p.next_follow_up < today;
  const due = !!p.next_follow_up && p.next_follow_up <= today;
  switch (p.status) {
    case "new":
      return { title: "Send the first message", why: !p.website ? "They have no website, so lead with that." : "Keep it short and ask for a quick chat.", template: !p.website ? "nosite" : "intro", tone: "normal" };
    case "contacted":
      return due ? { title: overdue ? "Follow up now, it is overdue" : "Follow up today", why: `No reply for ${idle} day${idle === 1 ? "" : "s"}. A gentle nudge works best.`, template: "followup", tone: overdue ? "urgent" : "normal" }
        : { title: "Wait for a reply", why: `Next nudge is planned for ${p.next_follow_up}.`, tone: "calm" };
    case "replied":
      return { title: "Book a short call or meeting", why: "They answered, so move fast while they are warm. Offer two time slots.", template: "meeting", tone: due ? "urgent" : "normal" };
    case "meeting":
      return { title: "Send the proposal", why: "Send it within 24 hours of the meeting, while the conversation is fresh.", template: "proposal", tone: due ? "urgent" : "normal" };
    case "proposal":
      return due ? { title: "Chase the proposal", why: `Sent ${idle} day${idle === 1 ? "" : "s"} ago. Ask what questions they have, and offer to adjust it.`, template: "chase", tone: "urgent" }
        : { title: "Give them time to read it", why: `Chase on ${p.next_follow_up}. Be ready for price objections.`, tone: "calm" };
    case "won": return { title: "Onboard the client", why: "Set up their projects, invoice and first tasks.", tone: "calm" };
    default: return { title: "Closed", why: "Move back to an open stage if they come back.", tone: "calm" };
  }
}
export const isCold = (p: { status: string; last_touch_at?: string | null }, days = 7) =>
  !["won", "lost", "new"].includes(p.status) && !!p.last_touch_at && Date.now() - new Date(p.last_touch_at).getTime() > days * DAY;

export const PLAYBOOK: Record<string, string[]> = {
  new: ["Check their website and Instagram for one specific thing you can improve", "Send a short first message, not a long pitch", "Do not send the same text to everyone"],
  contacted: ["Follow up after 3 days, once", "A second follow-up should add value (an idea, an example)", "No reply after 3 attempts: mark Lost and revisit in 3 months"],
  replied: ["Answer their question first", "Ask what their main goal is (more calls, more walk-ins, more sales)", "Suggest a 15 minute call and give two times"],
  meeting: ["Ask about goals and budget, then listen", "Agree the next step before you leave", "Send the proposal within 24 hours"],
  proposal: ["Keep the proposal to one page with one clear price", "Follow up after 3 days", "Offer a smaller starter package if price is the worry"],
};

export const OBJECTIONS: { q: string; reply: string }[] = [
  { q: "“It's too expensive”", reply: "I understand. Which part feels like too much? We can start with a smaller package, for example just the social media or just the website, and add more once you see results." },
  { q: "“Let me think about it”", reply: "Of course. So I can help you decide, what would you want to be sure about? I'm happy to send a short example of what we did for a similar business." },
  { q: "“We already have someone”", reply: "That's good to hear. Many of our clients had someone before. If you want a second opinion, I can look at your pages and send three ideas for free, no obligation." },
  { q: "“Not right now”", reply: "No problem at all. When would be a better time? I'll check back then. In the meantime I'll send you one quick idea you can use for free." },
  { q: "“Does this really work?”", reply: "Fair question. I can show you results from a similar business, and we keep reporting simple so you always see what you get for your money." },
  { q: "“I can do it myself”", reply: "You probably could, but it takes hours each week that you'd rather spend running the business. We take that off your plate and keep it consistent." },
];
