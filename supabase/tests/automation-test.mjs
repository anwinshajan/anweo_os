import { isoWeekday, isTemplateDue, dueDateFor, leastLoaded, monthRange } from "../../src/lib/recurrence.ts";
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };
const T = (o) => ({ cadence: "weekly", weekday: 1, day_of_month: null, active: true, last_run: null, due_in_days: 3, ...o });

ok("weekday numbers: Monday is 1, Sunday is 7", isoWeekday("2026-11-02") === 1 && isoWeekday("2026-11-08") === 7 && isoWeekday("2026-11-04") === 3);
ok("a weekly task is due on its weekday", isTemplateDue(T({ weekday: 1 }), "2026-11-02") && !isTemplateDue(T({ weekday: 1 }), "2026-11-03"));
ok("a monthly task is due on its day of the month", isTemplateDue(T({ cadence: "monthly", weekday: null, day_of_month: 25 }), "2026-11-25") && !isTemplateDue(T({ cadence: "monthly", weekday: null, day_of_month: 25 }), "2026-11-24"));
ok("a task is created once per day", !isTemplateDue(T({ weekday: 1, last_run: "2026-11-02" }), "2026-11-02"));
ok("a task made last week is due again this week", isTemplateDue(T({ weekday: 1, last_run: "2026-10-26" }), "2026-11-02"));
ok("paused templates never fire", !isTemplateDue(T({ active: false }), "2026-11-02"));
ok("the due date is counted from today", dueDateFor({ due_in_days: 3 }, "2026-11-02") === "2026-11-05" && dueDateFor({ due_in_days: 0 }, "2026-11-02") === "2026-11-02");
ok("the person with the fewest open tasks gets the work", leastLoaded([{ id: "a" }, { id: "b" }, { id: "c" }], { a: 5, b: 2, c: 7 }) === "b");
ok("people with no tasks count as zero", leastLoaded([{ id: "a" }, { id: "b" }], { a: 1 }) === "b");
ok("ties go to the first person", leastLoaded([{ id: "a" }, { id: "b" }], { a: 2, b: 2 }) === "a");
ok("nobody to assign gives null", leastLoaded([], {}) === null);
ok("month range handles December and rejects bad input", monthRange("2026-12")?.end === "2027-01-01" && monthRange("2026-02")?.start === "2026-02-01" && monthRange("2026-13") === null && monthRange("nope") === null);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
