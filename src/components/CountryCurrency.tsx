"use client";
import { useState } from "react";
import { COUNTRIES, CURRENCIES, currencyForCountry } from "@/lib/currency";

// Country and billing currency side by side. Choosing a country suggests its currency,
// and the currency can still be changed by hand.
export default function CountryCurrency({ defaultCountry = "India", defaultCurrency }: { defaultCountry?: string; defaultCurrency?: string }) {
  const known = COUNTRIES.some((c) => c.name === defaultCountry);
  const [country, setCountry] = useState(known ? defaultCountry : "Other");
  const [currency, setCurrency] = useState(defaultCurrency ?? currencyForCountry(defaultCountry));
  return (
    <>
      <div>
        <label className="label" htmlFor="country">Country</label>
        <select id="country" name="country" value={country} className="input"
          onChange={(e) => { setCountry(e.target.value); setCurrency(currencyForCountry(e.target.value)); }}>
          {COUNTRIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="currency">Billing currency</label>
        <select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </select>
      </div>
    </>
  );
}
