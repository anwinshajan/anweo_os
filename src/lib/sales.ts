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

export const SOURCES = ["manual", "google", "csv", "referral", "instagram", "walk-in", "other"];
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
  { id: "proposal", name: "After meeting", body: "Hi {contact}, great speaking with you. As promised, I'm sending the proposal for {business}. Let me know what you think and I'll adjust anything you like. {me}, Anweo" },
];
export const fillTemplate = (t: string, v: { contact?: string | null; business: string; me: string }) =>
  t.replaceAll("{contact}", v.contact?.split(" ")[0] || "there").replaceAll("{business}", v.business).replaceAll("{me}", v.me);

// ---- Google Places lead search (needs GOOGLE_PLACES_API_KEY; see README)
export type Found = {
  place_id: string; business_name: string; address: string | null; city: string | null; phone: string | null;
  website: string | null; rating: number | null; review_count: number | null; maps_url: string | null; category: string | null; score: number;
};
export async function searchPlaces(query: string, key: string): Promise<Found[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryTypeDisplayName,places.businessStatus",
    },
    body: JSON.stringify({ textQuery: query, pageSize: 20 }),
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message || `Google search failed (${res.status})`);
  }
  const j = (await res.json()) as { places?: any[] };
  return (j.places ?? [])
    .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY")
    .map((p) => {
      const address: string | null = p.formattedAddress ?? null;
      const parts = address?.split(",").map((x: string) => x.trim()) ?? [];
      const f = {
        place_id: String(p.id),
        business_name: String(p.displayName?.text ?? "Unknown"),
        address,
        city: parts.length >= 3 ? parts[parts.length - 2].replace(/\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/, "").trim() || null : null,
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
        website: p.websiteUri ?? null,
        rating: typeof p.rating === "number" ? p.rating : null,
        review_count: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        maps_url: p.googleMapsUri ?? null,
        category: p.primaryTypeDisplayName?.text ?? null,
      };
      return { ...f, score: opportunityScore({ ...f, instagram: null }) };
    })
    .sort((a, b) => b.score - a.score);
}

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
