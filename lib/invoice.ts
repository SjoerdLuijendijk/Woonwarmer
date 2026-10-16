export const VAT_RATES = [21, 9, 0] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const DEFAULT_VAT_RATE: VatRate = 21;
export const MAX_INVOICE_LINES = 50;
export const MAX_QUANTITY = 1000;

export type Company = {
  name: string;
  address: string;
  postal_code: string;
  city: string;
  kvk_number: string;
  vat_number: string;
  iban: string;
  email: string | null;
  phone: string | null;
  payment_term_days: number;
  /** Installation work per hour, excluding VAT; absent on invoices made before it existed. */
  hourly_rate_ex_cents?: number | null;
  /** Small print at the bottom of every invoice; absent on invoices made before it existed. */
  invoice_footer?: string | null;
};

/** VAT rate of installation work. */
export const MONTAGE_VAT_RATE: VatRate = 21;

export type Customer = {
  name: string;
  address: string;
  postal_code: string;
  city: string;
  email: string | null;
  phone: string | null;
};

/** Printed on invoices with margin scheme lines, as the law requires for used goods. */
export const MARGIN_SCHEME_NOTE = "Bijzondere regeling – gebruikte goederen";

/**
 * Unit price in cents including VAT; negative for a stove taken in part exchange. A margin scheme
 * line (a used stove) shows no VAT and has vat_rate 0.
 */
export type InvoiceLine = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: VatRate;
  margin_scheme: boolean;
  /** The stove or article the line came from, for its photo. */
  stove_number?: number | null;
  article_id?: number | null;
  /** The photo shown on the PDF; filled in when the document is read, never stored. */
  image_url?: string | null;
};

export type Invoice = {
  number: string | null; // null for a draft preview
  issueDate: string; // yyyy-mm-dd
  /** Null for a separate invoice that is not about a stove. */
  stoveNumber: number | null;
  seller: Company;
  customer: Customer;
  lines: InvoiceLine[];
};

export type VatGroup = { rate: VatRate; exclCents: number; vatCents: number; inclCents: number };

export function lineTotalCents(line: InvoiceLine) {
  return line.quantity * line.unit_price_cents;
}

const sumLines = (lines: InvoiceLine[]) => lines.reduce((sum, line) => sum + lineTotalCents(line), 0);

// Prices include VAT; the VAT is calculated per rate over the summed line totals. Margin scheme
// lines carry no VAT on the invoice and are totalled separately (marginCents).
export function invoiceTotals(lines: InvoiceLine[]) {
  const vatLines = lines.filter((line) => !line.margin_scheme);
  const groups: VatGroup[] = VAT_RATES.flatMap((rate) => {
    const rateLines = vatLines.filter((line) => line.vat_rate === rate);
    if (rateLines.length === 0) return [];
    const inclCents = sumLines(rateLines);
    const exclCents = Math.round((inclCents * 100) / (100 + rate));
    return [{ rate, exclCents, vatCents: inclCents - exclCents, inclCents }];
  });
  const marginCents = sumLines(lines.filter((line) => line.margin_scheme));
  return {
    groups,
    hasMarginScheme: lines.some((line) => line.margin_scheme),
    marginCents,
    exclCents: groups.reduce((sum, group) => sum + group.exclCents, 0),
    vatCents: groups.reduce((sum, group) => sum + group.vatCents, 0),
    inclCents: marginCents + groups.reduce((sum, group) => sum + group.inclCents, 0),
  };
}

export function isVatRate(value: unknown): value is VatRate {
  return VAT_RATES.includes(value as VatRate);
}
