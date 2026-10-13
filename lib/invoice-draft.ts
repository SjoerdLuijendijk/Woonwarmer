import { articleDescription, salePriceInclCents, type Article } from "./articles";
import { DEFAULT_VAT_RATE, MONTAGE_VAT_RATE, MAX_QUANTITY, type Customer, type InvoiceLine, type VatRate } from "./invoice";
import { formatPriceInput, parsePriceToCents } from "./price";
import { stoveProductName } from "./stove-specs";
import { CONDITION_LABELS, type Stove } from "./stoves";

/**
 * Invoice or quote line as edited in the form: quantity and price are still text. Quote lines also
 * remember the stove or article they came from, and whether a typed line goes into the article list.
 */
export type DraftLine = {
  key: string;
  description: string;
  quantity: string;
  price: string;
  vatRate: VatRate;
  /** Margin scheme (used stove): no VAT on the invoice; vatRate is then 0. */
  marginScheme?: boolean;
  stoveNumber?: number | null;
  articleId?: number | null;
  saveAsArticle?: boolean;
};
export type DraftCustomer = Record<keyof Customer, string>;

export const EMPTY_CUSTOMER: DraftCustomer = { name: "", address: "", postal_code: "", city: "", email: "", phone: "" };

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `line-${keyCounter}`;
}

export function emptyLine(): DraftLine {
  return { key: nextKey(), description: "", quantity: "1", price: "", vatRate: DEFAULT_VAT_RATE };
}

/** A used stove is sold under the margin scheme; a new or made-to-order one with 21% VAT. */
export function isUsedStove(stove: Pick<Stove, "condition" | "madeToOrder">) {
  return !stove.madeToOrder && stove.condition !== "new";
}

type StoveLineSource = Pick<Stove, "number" | "brand" | "shopName" | "stoveType" | "condition" | "madeToOrder" | "priceCents">;

export function stoveLine(stove: StoveLineSource): DraftLine {
  const condition = stove.condition ? `, ${CONDITION_LABELS[stove.condition].toLowerCase()}` : "";
  const marginScheme = isUsedStove(stove);
  return {
    key: nextKey(),
    description: `Kachel ${stove.number} – ${stoveProductName(stove)}${condition}`,
    quantity: "1",
    price: stove.priceCents ? formatPriceInput(stove.priceCents) : "",
    vatRate: marginScheme ? 0 : DEFAULT_VAT_RATE,
    marginScheme,
    stoveNumber: stove.number,
  };
}

/** Value of the VAT select of a line: a rate or "margin". */
export function draftVatValue(line: Pick<DraftLine, "vatRate" | "marginScheme">) {
  return line.marginScheme ? "margin" : String(line.vatRate);
}

export function draftVatPatch(value: string): Pick<DraftLine, "vatRate" | "marginScheme"> {
  return value === "margin" ? { vatRate: 0, marginScheme: true } : { vatRate: Number(value) as VatRate, marginScheme: false };
}

/** One hour of installation work at the company's hourly rate (excluding VAT in the settings). */
export function montageLine(hourlyRateExCents: number | null | undefined): DraftLine {
  const incl = hourlyRateExCents == null ? null : Math.round((hourlyRateExCents * (100 + MONTAGE_VAT_RATE)) / 100);
  return {
    key: nextKey(),
    description: "Montage (per uur)",
    quantity: "1",
    price: incl === null ? "" : formatPriceInput(incl),
    vatRate: MONTAGE_VAT_RATE,
  };
}

export function articleLine(article: Pick<Article, "id" | "name" | "diameterMm" | "lengthMm" | "salePriceExCents" | "vatRate">): DraftLine {
  const price = salePriceInclCents(article);
  return {
    key: nextKey(),
    description: articleDescription(article),
    quantity: "1",
    price: price === null ? "" : formatPriceInput(price),
    vatRate: article.vatRate,
    articleId: article.id,
  };
}

export function draftLineVat(line: Pick<DraftLine, "vatRate" | "marginScheme">): Pick<InvoiceLine, "vat_rate" | "margin_scheme"> {
  return line.marginScheme ? { vat_rate: 0, margin_scheme: true } : { vat_rate: line.vatRate, margin_scheme: false };
}

function parseQuantity(value: string) {
  const quantity = Number(value.trim());
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

// Converts the edited lines; lines that are not complete yet are reported by index.
export function toInvoiceLines(lines: DraftLine[]) {
  const valid: InvoiceLine[] = [];
  const invalid: number[] = [];
  lines.forEach((line, index) => {
    const quantity = parseQuantity(line.quantity);
    const price = parsePriceToCents(line.price, { allowNegative: true });
    const description = line.description.trim();
    if (!description || quantity === null || price === null) invalid.push(index);
    else valid.push({ description, quantity, unit_price_cents: price, ...draftLineVat(line) });
  });
  return { valid, invalid };
}

export function toCustomer(draft: DraftCustomer): Customer {
  const clean = (value: string) => value.trim();
  return {
    name: clean(draft.name),
    address: clean(draft.address),
    postal_code: clean(draft.postal_code),
    city: clean(draft.city),
    email: clean(draft.email) || null,
    phone: clean(draft.phone) || null,
  };
}

export function todayIsoDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
