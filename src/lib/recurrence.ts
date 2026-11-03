// Pure helpers for recurring tasks (safe to test without a database).
import { addDays } from "./payments.ts";

// 1 = Monday ... 7 = Sunday, for a "YYYY-MM-DD" day.
export function isoWeekday(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export type Template = { cadence: string; weekday: number | null; day_of_month: number | null; active: boolean; last_run: string | null; due_in_days: number };

// A template is due on its weekday (weekly) or day of the month (monthly), once per day.
export function isTemplateDue(t: Template, today: string): boolean {
  if (!t.active || t.last_run === today) return false;
  if (t.cadence === "weekly") return t.weekday === isoWeekday(today);
  if (t.cadence === "monthly") return t.day_of_month === Number(today.slice(8, 10));
  return false;
}

export const dueDateFor = (t: Pick<Template, "due_in_days">, today: string) => addDays(today, t.due_in_days);

// The person with the fewest open tasks (ties go to whoever has been waiting longest for work: the first in the list).
export function leastLoaded(candidates: { id: string }[], openCounts: Record<string, number>): string | null {
  let best: string | null = null, bestN = Infinity;
  for (const c of candidates) {
    const n = openCounts[c.id] ?? 0;
    if (n < bestN) { best = c.id; bestN = n; }
  }
  return best;
}

export const monthRange = (ym: string): { start: string; end: string } | null => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${ym}-01`, end: `${next}-01` };
};
