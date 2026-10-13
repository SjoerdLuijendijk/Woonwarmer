export const MAX_PRICE_CENTS = 100_000_000;

const THOUSANDS_ONLY = /^\d{1,3}(\.\d{3})+$/;

// Parses Dutch-style input such as "1.250", "1250,50" or "€ 899" into euro cents.
// With allowZero, "0" is accepted (for example a free option on an invoice); with allowNegative,
// also "-100" (a stove taken in part exchange).
export function parsePriceToCents(input: string, { allowZero = false, allowNegative = false } = {}): number | null {
  let value = input.replace(/[€\s]/g, "");
  const negative = allowNegative && /^[-−]/.test(value);
  if (negative) value = value.slice(1);
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  else if (THOUSANDS_ONLY.test(value)) value = value.replace(/\./g, "");

  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  if (negative) return cents >= 1 && cents <= MAX_PRICE_CENTS ? -cents : null;
  return cents >= (allowZero || allowNegative ? 0 : 1) && cents <= MAX_PRICE_CENTS ? cents : null;
}

// Whole euros drop the decimals ("€ 1.250") unless alwaysCents is set ("€ 1.250,00").
export function formatPrice(cents: number, { alwaysCents = false } = {}) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: alwaysCents || cents % 100 !== 0 ? 2 : 0,
  }).format(cents / 100);
}

// Value for a price input field, e.g. 125050 -> "1250,50".
export function formatPriceInput(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}
