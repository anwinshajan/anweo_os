// Payment maths: due dates, late interest and splitting a price into advance / final payments.
// Safe to import from client and server code. Dates are plain "YYYY-MM-DD" strings (UTC days).

const DAY = 86_400_000;

const utcDay = (d: string | Date): number => {
  const x = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

export const isoDay = (d: Date | number = Date.now()): string => new Date(d).toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  return isoDay(utcDay(iso) + n * DAY);
}

// When an invoice must be paid by: its own due date, or the issue date plus the client's payment terms.
export function effectiveDueDate(inv: { due_date: string | null; issued_at: string }, termsDays: number): string {
  return inv.due_date ?? addDays(inv.issued_at.slice(0, 10), termsDays);
}

export const isOverdue = (dueIso: string, today: string | Date = new Date()): boolean => utcDay(dueIso) < utcDay(today);

// Whole days past the due date, after the grace period.
export function daysLate(dueIso: string, today: string | Date, graceDays = 0): number {
  return Math.max(0, Math.floor((utcDay(today) - utcDay(dueIso)) / DAY) - Math.max(0, graceDays));
}

// Simple (not compounded) interest: amount x rate per month x (days late / 30), rounded to pence.
export function lateInterest(o: { amount: number; due: string; today: string | Date; graceDays: number; percentPerMonth: number }): number {
  if (!(o.amount > 0) || !(o.percentPerMonth > 0)) return 0;
  const d = daysLate(o.due, o.today, o.graceDays);
  return Math.round(o.amount * (o.percentPerMonth / 100) * (d / 30) * 100) / 100;
}

// Split a total by percentages. Each part is rounded to 2 decimals and the last part
// takes whatever is left, so the parts always add up to exactly the total.
export function splitAmounts(total: number, percents: number[]): number[] {
  const parts: number[] = [];
  let used = 0;
  percents.forEach((p, i) => {
    if (i === percents.length - 1) parts.push(Math.round((total - used) * 100) / 100);
    else {
      const a = Math.round(total * p) / 100;
      parts.push(a);
      used += a;
    }
  });
  return parts;
}

export const percentsAddUp = (percents: number[]): boolean => Math.abs(percents.reduce((a, b) => a + b, 0) - 100) < 0.01;

export const intervalLabel: Record<string, string> = { monthly: "month", quarterly: "quarter", yearly: "year" };
