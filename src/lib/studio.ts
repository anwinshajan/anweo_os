// The studio workflow: idea → drafting → in review → approved → posted (with "changes needed" when a manager sends it back).
export const STAGES = [
  { key: "idea", label: "Ideas", statuses: ["idea"] },
  { key: "draft", label: "Drafting", statuses: ["in_progress"] },
  { key: "review", label: "In review", statuses: ["awaiting_approval"] },
  { key: "changes", label: "Changes needed", statuses: ["rejected"] },
  { key: "approved", label: "Approved", statuses: ["approved", "scheduled"] },
  { key: "posted", label: "Posted", statuses: ["posted"] },
] as const;

export const stageOf = (status: string) => STAGES.find((s) => (s.statuses as readonly string[]).includes(status)) ?? STAGES[0];
export const stageTone: Record<string, string> = {
  idea: "bg-charcoal/10 text-charcoal", draft: "bg-forest-soft text-forest", review: "bg-amber-100 text-amber-800",
  changes: "bg-red-50 text-red-700", approved: "bg-lime-soft text-forest", posted: "bg-forest text-paper",
};
