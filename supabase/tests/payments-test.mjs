import { addDays, daysLate, effectiveDueDate, isOverdue, lateInterest, percentsAddUp, splitAmounts, isoDay } from "../../src/lib/payments.ts";
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };

// ---- days late and grace
ok("not late on the due date", daysLate("2026-11-10", "2026-11-10") === 0);
ok("not late before the due date", daysLate("2026-11-10", "2026-11-05") === 0);
ok("10 days late", daysLate("2026-11-01", "2026-11-11") === 10);
ok("grace days are not counted", daysLate("2026-11-01", "2026-11-11", 3) === 7);
ok("inside the grace period nothing is late", daysLate("2026-11-01", "2026-11-03", 5) === 0);
ok("works across month and year ends", daysLate("2026-12-28", "2027-01-04") === 7);
ok("a leap day is counted", daysLate("2028-02-27", "2028-03-01") === 3);

// ---- interest
ok("30 days late at 2% a month is 2% of the amount", lateInterest({ amount: 1000, due: "2026-11-01", today: "2026-12-01", graceDays: 0, percentPerMonth: 2 }) === 20);
ok("15 days late is half a month of interest", lateInterest({ amount: 1000, due: "2026-11-01", today: "2026-11-16", graceDays: 0, percentPerMonth: 2 }) === 10);
ok("the grace period reduces the interest", lateInterest({ amount: 1000, due: "2026-11-01", today: "2026-12-01", graceDays: 15, percentPerMonth: 2 }) === 10);
ok("no interest when the rate is zero", lateInterest({ amount: 1000, due: "2026-01-01", today: "2026-12-01", graceDays: 0, percentPerMonth: 0 }) === 0);
ok("no interest when not yet late", lateInterest({ amount: 1000, due: "2026-12-01", today: "2026-11-01", graceDays: 0, percentPerMonth: 2 }) === 0);
ok("no interest on a zero or negative amount", lateInterest({ amount: 0, due: "2026-01-01", today: "2026-12-01", graceDays: 0, percentPerMonth: 2 }) === 0 && lateInterest({ amount: -5, due: "2026-01-01", today: "2026-12-01", graceDays: 0, percentPerMonth: 2 }) === 0);
ok("interest is rounded to pence", lateInterest({ amount: 333.33, due: "2026-11-01", today: "2026-11-08", graceDays: 0, percentPerMonth: 1.5 }) === 1.17);
ok("interest is simple, not compounded (a year late at 2% a month is 24%)", lateInterest({ amount: 1000, due: "2026-01-01", today: "2026-12-27", graceDays: 0, percentPerMonth: 2 }) === 240);
ok("rupee amounts work the same", lateInterest({ amount: 42000, due: "2026-11-01", today: "2026-11-30", graceDays: 0, percentPerMonth: 2 }) === 812);

// ---- due dates
ok("due date defaults to issue date plus terms", effectiveDueDate({ due_date: null, issued_at: "2026-11-01" }, 7) === "2026-11-08");
ok("an explicit due date wins", effectiveDueDate({ due_date: "2026-11-20", issued_at: "2026-11-01" }, 7) === "2026-11-20");
ok("terms cross a month end", addDays("2026-11-28", 7) === "2026-12-05");
ok("overdue only after the due day", isOverdue("2026-11-01", "2026-11-02") && !isOverdue("2026-11-02", "2026-11-02") && !isOverdue("2026-11-03", "2026-11-02"));
ok("isoDay formats a date", isoDay(Date.UTC(2026, 10, 2)) === "2026-11-02");

// ---- splitting
ok("50/50 split", splitAmounts(60000, [50, 50]).join() === "30000,30000");
ok("30/40/30 split", splitAmounts(1000, [30, 40, 30]).join() === "300,400,300");
ok("an awkward total still adds up exactly", splitAmounts(100, [33.33, 33.33, 33.34]).reduce((a, b) => a + b, 0).toFixed(2) === "100.00");
ok("the last part absorbs rounding", splitAmounts(1000.01, [50, 50]).join() === "500,500.01" || splitAmounts(1000.01, [50, 50]).join() === "500.01,500");
ok("100% upfront", splitAmounts(750, [100]).join() === "750");
ok("percentages must add up to 100", percentsAddUp([50, 50]) && percentsAddUp([33.33, 33.33, 33.34]) && !percentsAddUp([50, 40]) && !percentsAddUp([60, 60]));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
