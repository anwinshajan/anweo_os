// Currencies, countries and exchange-rate maths. Safe to import from client and server code.

export const BASE_CURRENCY = "GBP"; // the currency company totals are reported in

export const CURRENCIES = [
  { code: "GBP", name: "British pound", locale: "en-GB" },
  { code: "INR", name: "Indian rupee", locale: "en-IN" },
  { code: "USD", name: "US dollar", locale: "en-US" },
  { code: "EUR", name: "Euro", locale: "en-IE" },
  { code: "AED", name: "UAE dirham", locale: "en-AE" },
  { code: "SAR", name: "Saudi riyal", locale: "en-SA" },
  { code: "QAR", name: "Qatari riyal", locale: "en-QA" },
  { code: "CAD", name: "Canadian dollar", locale: "en-CA" },
  { code: "AUD", name: "Australian dollar", locale: "en-AU" },
  { code: "SGD", name: "Singapore dollar", locale: "en-SG" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

// Where a client is based decides the currency the form suggests (it can always be changed).
export const COUNTRIES: { name: string; currency: CurrencyCode }[] = [
  { name: "India", currency: "INR" },
  { name: "United Kingdom", currency: "GBP" },
  { name: "United States", currency: "USD" },
  { name: "United Arab Emirates", currency: "AED" },
  { name: "Saudi Arabia", currency: "SAR" },
  { name: "Qatar", currency: "QAR" },
  { name: "Canada", currency: "CAD" },
  { name: "Australia", currency: "AUD" },
  { name: "Singapore", currency: "SGD" },
  { name: "Ireland", currency: "EUR" },
  { name: "Germany", currency: "EUR" },
  { name: "France", currency: "EUR" },
  { name: "Other", currency: "GBP" },
];

export const isCurrency = (c: string): c is CurrencyCode => CURRENCIES.some((x) => x.code === c);
export const currencyForCountry = (country: string): CurrencyCode => COUNTRIES.find((c) => c.name === country)?.currency ?? "GBP";

export function formatMoney(n: number | string, currency: string): string {
  const value = Number(n);
  const locale = CURRENCIES.find((c) => c.code === currency)?.locale ?? "en-GB";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

// Rates are stored as "pounds per 1 unit" (gbp_per_unit), e.g. INR 0.0090.
export type Rates = Record<string, number>;

// Add up amounts that are in different currencies, expressed in pounds.
// Currencies with no rate are left out and reported, never guessed.
export function toBase(totalsByCurrency: Record<string, number>, rates: Rates): { total: number; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  for (const [cur, amount] of Object.entries(totalsByCurrency)) {
    if (cur === BASE_CURRENCY) total += amount;
    else if (rates[cur] > 0) total += amount * rates[cur];
    else missing.push(cur);
  }
  return { total, missing };
}

// Live providers quote "units of X per 1 GBP". Convert that to our "GBP per 1 unit".
export function ratesFromGbpBase(json: unknown): Rates | null {
  const j = json as { result?: string; base_code?: string; rates?: Record<string, unknown> } | null;
  if (!j || j.result !== "success" || j.base_code !== "GBP" || !j.rates || typeof j.rates !== "object") return null;
  const out: Rates = {};
  for (const c of CURRENCIES) {
    if (c.code === BASE_CURRENCY) continue;
    const unitsPerGbp = Number(j.rates[c.code]);
    if (Number.isFinite(unitsPerGbp) && unitsPerGbp > 0) out[c.code] = 1 / unitsPerGbp;
  }
  return Object.keys(out).length ? out : null;
}

// "How many X for £1" is the natural way to read and type a rate.
export const unitsPerGbp = (gbpPerUnit: number) => (gbpPerUnit > 0 ? 1 / gbpPerUnit : 0);
