import { isVatRate, MAX_INVOICE_LINES, MAX_QUANTITY, type InvoiceLine } from "./invoice";
import { isLinePrice } from "./invoice-validation";

// Quotes (tables quotes and quote_lines). Keep in sync with the articles and quotes migration.
export const QUOTE_STATUS_LABELS = { draft: "Concept", sent: "Verstuurd", accepted: "Geaccepteerd", rejected: "Afgewezen" } as const;
export type QuoteStatus = keyof typeof QUOTE_STATUS_LABELS;
export const DEFAULT_VALID_DAYS = 30;
export const MAX_NOTES_LENGTH = 2000;

export type QuoteCustomer = {
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
};

/** A line with the stove or article it came from. Unit price in cents including VAT. */
export type QuoteLine = InvoiceLine & { stove_number: number | null; article_id: number | null };

export type Quote = {
  id: number | null;
  /** Null for a preview of a quote that has not been saved yet. */
  number: string | null;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  customer: QuoteCustomer;
  notes: string | null;
  lines: QuoteLine[];
};

export type QuoteSummary = {
  id: number;
  number: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  customerName: string;
  /** The first line's description, to recognise the quote. */
  subject: string;
  totalCents: number;
};

/** A line as sent by the quote dialog; saveAsArticle adds a typed line to the article list. */
export type QuoteLineInput = QuoteLine & { save_as_article?: boolean };
export type QuoteInput = { customer: QuoteCustomer; validUntil: string; notes: string | null; lines: QuoteLineInput[] };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function text(value: unknown, max: number): string | null | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return null;
  return trimmed.length <= max ? trimmed : undefined;
}

const optionalId = (value: unknown) => (Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : null);

// Validates untrusted quote input from the quote dialog. Only the customer's name and the lines are
// required.
export function parseQuoteInput(input: unknown, today: string): Result<QuoteInput> {
  const raw = (typeof input === "object" && input) || {};
  const get = (key: string) => (raw as Record<string, unknown>)[key];
  const rawCustomer = (typeof get("customer") === "object" && get("customer")) || {};
  const field = (key: string) => (rawCustomer as Record<string, unknown>)[key];

  const customer = {
    name: text(field("name"), 200),
    address: text(field("address"), 200),
    postalCode: text(field("postalCode"), 20),
    city: text(field("city"), 100),
    email: text(field("email"), 320),
    phone: text(field("phone"), 40),
  };
  if (!customer.name) return { ok: false, error: "Vul de naam van de klant in." };
  if (Object.values(customer).some((value) => value === undefined)) return { ok: false, error: "Een van de klantgegevens is te lang." };

  const validUntil = get("validUntil");
  if (typeof validUntil !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || Number.isNaN(Date.parse(validUntil))) {
    return { ok: false, error: "Vul een geldige datum in bij Geldig tot." };
  }
  if (validUntil < today) return { ok: false, error: "Geldig tot ligt in het verleden." };

  const notes = text(get("notes"), MAX_NOTES_LENGTH);
  if (notes === undefined) return { ok: false, error: `De opmerking is langer dan ${MAX_NOTES_LENGTH} tekens.` };

  const rawLines = get("lines");
  if (!Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > MAX_INVOICE_LINES) {
    return { ok: false, error: `Een offerte heeft 1 tot ${MAX_INVOICE_LINES} regels.` };
  }
  const lines: QuoteLineInput[] = [];
  for (const [index, rawLine] of rawLines.entries()) {
    const line = ((typeof rawLine === "object" && rawLine) || {}) as Record<string, unknown>;
    const description = text(line.description, 200);
    const { quantity, unit_price_cents: price, vat_rate: rate, margin_scheme: marginScheme } = line;
    const validQuantity = Number.isInteger(quantity) && (quantity as number) >= 1 && (quantity as number) <= MAX_QUANTITY;
    if (!description || !validQuantity || !isLinePrice(price) || !isVatRate(rate) || typeof marginScheme !== "boolean") {
      return { ok: false, error: `Regel ${index + 1} is niet compleet: vul omschrijving, aantal en prijs in.` };
    }
    lines.push({
      description,
      quantity: quantity as number,
      unit_price_cents: price,
      vat_rate: marginScheme ? 0 : rate,
      margin_scheme: marginScheme,
      stove_number: optionalId(line.stove_number),
      article_id: optionalId(line.article_id),
      // Articles have a VAT rate and a price of their own: no margin scheme or part exchange lines.
      save_as_article: line.save_as_article === true && !marginScheme && price >= 0,
    });
  }

  return { ok: true, value: { customer: customer as QuoteCustomer, validUntil, notes, lines } };
}
