import { CURRENCIES } from "@/lib/currency";

// A plain dropdown of every supported currency. Works inside any server-rendered form.
export default function CurrencySelect({
  name = "currency", defaultValue = "GBP", className = "input", extraFirst, short = false,
}: { name?: string; defaultValue?: string; className?: string; extraFirst?: { value: string; label: string }; short?: boolean }) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} aria-label="Currency">
      {extraFirst && <option value={extraFirst.value}>{extraFirst.label}</option>}
      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{short ? c.code : `${c.code} · ${c.name}`}</option>)}
    </select>
  );
}
