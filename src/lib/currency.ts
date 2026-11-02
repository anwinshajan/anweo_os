// Currencies, countries and exchange-rate maths. Safe to import from client and server code.

export const BASE_CURRENCY = "GBP"; // the default when nothing else is chosen. Money is never converted between currencies.

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
