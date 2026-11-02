import { formatMoney, currencyForCountry, isCurrency, CURRENCIES, COUNTRIES } from "../../src/lib/currency.ts";
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };

ok("pounds format", formatMoney(1234.5, "GBP") === "£1,234.50");
ok("rupees use Indian grouping", formatMoney(1234567, "INR").replace(/\s/g, "") === "₹12,34,567.00");
ok("dollars format", formatMoney(380, "USD") === "$380.00");
ok("negative amounts keep their sign and currency", formatMoney(-12.99, "GBP").includes("12.99") && formatMoney(-12.99, "GBP").includes("-"));
ok("an unknown currency does not crash", formatMoney(5, "ZZZ").length > 0);
ok("country defaults", currencyForCountry("India") === "INR" && currencyForCountry("United Kingdom") === "GBP" && currencyForCountry("Germany") === "EUR" && currencyForCountry("United Arab Emirates") === "AED");
ok("an unknown country falls back to pounds", currencyForCountry("Narnia") === "GBP");
ok("currency code check", isCurrency("INR") && !isCurrency("inr") && !isCurrency("RS"));
ok("every country maps to a supported currency", COUNTRIES.every((c) => CURRENCIES.some((x) => x.code === c.currency)));
ok("no duplicate currency codes", new Set(CURRENCIES.map((c) => c.code)).size === CURRENCIES.length);
ok("there is no conversion code left to misuse", !("toBase" in (await import("../../src/lib/currency.ts"))));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
