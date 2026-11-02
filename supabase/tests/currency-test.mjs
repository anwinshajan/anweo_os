import { toBase, ratesFromGbpBase, formatMoney, currencyForCountry, unitsPerGbp, isCurrency } from "../../src/lib/currency.ts";
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };

// live-style response: 1 GBP = 111.5 INR, 1.25 USD, 4.6 AED
const live = { result: "success", base_code: "GBP", rates: { GBP: 1, INR: 111.5, USD: 1.25, AED: 4.6, EUR: 1.16, XYZ: 9 } };
const r = ratesFromGbpBase(live);
ok("converts units-per-pound into pounds-per-unit", Math.abs(r.INR - 1 / 111.5) < 1e-12 && Math.abs(r.USD - 0.8) < 1e-12);
ok("ignores currencies the app doesn't support", !("XYZ" in r));
ok("never stores a rate for GBP itself", !("GBP" in r));
ok("rejects an error response", ratesFromGbpBase({ result: "error" }) === null);
ok("rejects a response quoted against another base", ratesFromGbpBase({ result: "success", base_code: "USD", rates: { INR: 80 } }) === null);
ok("rejects garbage", ratesFromGbpBase(null) === null && ratesFromGbpBase("x") === null && ratesFromGbpBase({}) === null);
ok("skips zero / negative / non-numeric rates", Object.keys(ratesFromGbpBase({ result: "success", base_code: "GBP", rates: { INR: 0, USD: -2, EUR: "abc", AED: 4 } })).join() === "AED");

// combining
const { total, missing } = toBase({ GBP: 500, INR: 111500, USD: 125 }, { INR: 1 / 111.5, USD: 0.8 });
ok("combines GBP + INR + USD into pounds", Math.abs(total - (500 + 1000 + 100)) < 1e-9 && missing.length === 0);
const m2 = toBase({ GBP: 100, AED: 460 }, { INR: 0.009 });
ok("leaves out currencies without a rate and reports them", m2.total === 100 && m2.missing.join() === "AED");
ok("GBP alone needs no rates", toBase({ GBP: 42 }, {}).total === 42);
ok("empty totals give zero", toBase({}, {}).total === 0);

// display
ok("pounds format", formatMoney(1234.5, "GBP") === "£1,234.50");
ok("rupees use Indian grouping", formatMoney(1234567, "INR").replace(/\s/g, "") === "₹12,34,567.00");
ok("unknown currency does not crash", formatMoney(5, "ZZZ").length > 0);
ok("country defaults", currencyForCountry("India") === "INR" && currencyForCountry("United Kingdom") === "GBP" && currencyForCountry("Germany") === "EUR" && currencyForCountry("Narnia") === "GBP");
ok("units per pound is the inverse", Math.abs(unitsPerGbp(1 / 111.5) - 111.5) < 1e-9 && unitsPerGbp(0) === 0);
ok("currency check", isCurrency("INR") && !isCurrency("inr") && !isCurrency("RS"));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
