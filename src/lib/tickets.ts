export const CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: "support", label: "Something isn't working", hint: "A bug, an error, or something that looks wrong" },
  { key: "change_request", label: "Change request", hint: "Edits to work we've already delivered" },
  { key: "new_service", label: "New service request", hint: "You'd like us to build or run something new" },
  { key: "billing", label: "Billing question", hint: "An invoice, a payment or a quote" },
  { key: "other", label: "Something else", hint: "Anything that doesn't fit above" },
];
export const categoryLabel = (k: string) => CATEGORIES.find((c) => c.key === k)?.label ?? k;

export const STATUSES: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_client", label: "Waiting on client" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];
export const statusLabel = (k: string) => STATUSES.find((s) => s.key === k)?.label ?? k;
export const statusTone: Record<string, string> = {
  open: "bg-amber-100 text-amber-800", in_progress: "bg-forest-soft text-forest", waiting_client: "bg-sky-100 text-sky-800",
  resolved: "bg-lime-soft text-forest", closed: "bg-charcoal/10 text-charcoal",
};
export const priorityTone: Record<string, string> = { low: "bg-charcoal/10 text-charcoal", normal: "bg-paper text-mute", high: "bg-amber-100 text-amber-800", urgent: "bg-red-50 text-red-700" };
export const isOpenStatus = (s: string) => s !== "resolved" && s !== "closed";
export const ticketRef = (n: number) => `#${String(n).padStart(4, "0")}`;
