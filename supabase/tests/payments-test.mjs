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

// ---- late fee (weekly, % of the unpaid amount)
const L = (amount, due, today, graceDays, percentPerWeek) => lateInterest({ amount, due, today, graceDays, percentPerWeek });
ok("one full week late adds one week's fee", L(1000, "2026-11-01", "2026-11-08", 0, 2) === 20);
ok("two full weeks late adds two weeks' fees", L(1000, "2026-11-01", "2026-11-15", 0, 2) === 40);
ok("a part week adds nothing yet", L(1000, "2026-11-01", "2026-11-07", 0, 2) === 0);
ok("13 days late is still one week", L(1000, "2026-11-01", "2026-11-14", 0, 2) === 20);
ok("the grace period delays the first fee", L(1000, "2026-11-01", "2026-11-08", 3, 2) === 0 && L(1000, "2026-11-01", "2026-11-11", 3, 2) === 20);
ok("no fee when the rate is zero", L(1000, "2026-01-01", "2026-12-01", 0, 0) === 0);
ok("no fee when not yet late", L(1000, "2026-12-01", "2026-11-01", 0, 2) === 0);
ok("no fee on a zero or negative amount", L(0, "2026-01-01", "2026-12-01", 0, 2) === 0 && L(-5, "2026-01-01", "2026-12-01", 0, 2) === 0);
ok("fee is rounded to pence", L(333.33, "2026-11-01", "2026-11-08", 0, 1.5) === 5);
ok("fee is flat, not compounded (10 weeks at 2% is 20%)", L(1000, "2026-11-01", "2027-01-10", 0, 2) === 200);
ok("rupee amounts work the same", L(42000, "2026-11-01", "2026-11-15", 0, 2) === 1680);

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
