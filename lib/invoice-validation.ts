import { isVatRate, MAX_INVOICE_LINES, MAX_QUANTITY, type Company, type Customer, type InvoiceLine } from "./invoice";
import { MAX_PRICE_CENTS, parsePriceToCents } from "./price";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function text(value: unknown, max: number) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return null;
  return trimmed.length <= max ? trimmed : undefined;
}

function optionalMoney(value: unknown): number | null | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return null;
  return parsePriceToCents(trimmed, { allowZero: true }) ?? undefined;
}

// Validates untrusted company settings from the settings form.
export function parseCompany(formData: FormData): Result<Company> {
  const value = {
    name: text(formData.get("name"), 200),
    address: text(formData.get("address"), 200),
    postal_code: text(formData.get("postal_code"), 20),
    city: text(formData.get("city"), 100),
    kvk_number: text(formData.get("kvk_number"), 20),
    vat_number: text(formData.get("vat_number"), 30),
    iban: text(String(formData.get("iban") ?? "").replace(/\s/g, "").toUpperCase(), 40),
    email: optionalText(formData.get("email"), 320),
    phone: optionalText(formData.get("phone"), 40),
    payment_term_days: Number(formData.get("payment_term_days")),
    hourly_rate_ex_cents: optionalMoney(formData.get("hourly_rate_ex")),
    invoice_footer: optionalText(String(formData.get("invoice_footer") ?? "").replace(/\r\n/g, "\n"), 2000),
  };
  if (!value.name || !value.address || !value.postal_code || !value.city) {
    return { ok: false, error: "Vul bedrijfsnaam, adres, postcode en plaats in." };
  }
  if (!value.kvk_number || !value.vat_number || !value.iban) return { ok: false, error: "Vul KvK-nummer, btw-nummer en IBAN in." };
  if (value.email === undefined || value.phone === undefined) return { ok: false, error: "E-mail of telefoon is te lang." };
  if (!Number.isInteger(value.payment_term_days) || value.payment_term_days < 0 || value.payment_term_days > 365) {
    return { ok: false, error: "Vul een betaaltermijn in dagen in (0–365)." };
  }
  if (value.invoice_footer === undefined) return { ok: false, error: "De voettekst is te lang (maximaal 2000 tekens)." };
  if (value.hourly_rate_ex_cents === undefined) return { ok: false, error: "Vul het uurtarief in als bijvoorbeeld 55 of 52,50." };
  return { ok: true, value: value as Company };
}

// A stove or article reference on a line; anything else counts as none.
const optionalId = (value: unknown) => (Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : null);

/** A line price in cents; negative for a stove taken in part exchange. */
export function isLinePrice(value: unknown): value is number {
  return Number.isInteger(value) && Math.abs(value as number) <= MAX_PRICE_CENTS;
}

// Validates untrusted customer details and invoice lines sent by the invoice dialog.
export function parseInvoiceInput(input: { customer: unknown; lines: unknown }): Result<{ customer: Customer; lines: InvoiceLine[] }> {
  const raw = (typeof input.customer === "object" && input.customer) || {};
  const get = (key: string) => (raw as Record<string, unknown>)[key];
  const customer = {
    name: text(get("name"), 200),
    address: text(get("address"), 200),
    postal_code: text(get("postal_code"), 20),
    city: text(get("city"), 100),
    email: optionalText(get("email"), 320),
    phone: optionalText(get("phone"), 40),
  };
  if (!customer.name || !customer.address || !customer.postal_code || !customer.city) {
    return { ok: false, error: "Vul naam, adres, postcode en plaats van de klant in." };
  }
  if (customer.email === undefined || customer.phone === undefined) return { ok: false, error: "E-mail of telefoon is te lang." };

  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > MAX_INVOICE_LINES) {
    return { ok: false, error: `Een factuur heeft 1 tot ${MAX_INVOICE_LINES} regels.` };
  }
  const lines: InvoiceLine[] = [];
  for (const [index, rawLine] of input.lines.entries()) {
    const line = (typeof rawLine === "object" && rawLine) || {};
    const { description, quantity, unit_price_cents: price, vat_rate: rate, margin_scheme: marginScheme, stove_number: stoveNumber, article_id: articleId } =
      line as Record<string, unknown>;
    const cleanDescription = text(description, 200);
    const validQuantity = Number.isInteger(quantity) && (quantity as number) >= 1 && (quantity as number) <= MAX_QUANTITY;
    if (!cleanDescription || !validQuantity || !isLinePrice(price) || !isVatRate(rate) || typeof marginScheme !== "boolean") {
      return { ok: false, error: `Regel ${index + 1} is niet compleet: vul omschrijving, aantal en prijs in.` };
    }
    lines.push({
      description: cleanDescription,
      quantity: quantity as number,
      unit_price_cents: price,
      vat_rate: marginScheme ? 0 : rate,
      margin_scheme: marginScheme,
      stove_number: optionalId(stoveNumber),
      article_id: optionalId(articleId),
    });
  }
  return { ok: true, value: { customer: customer as Customer, lines } };
}

/** Units of the invoiced stove to take from its stock; null when invalid. Only an invoice for a stove takes stock. */
export function parseStockDeduction(value: unknown, stoveNumber: number | null): number | null {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_QUANTITY) return null;
  return stoveNumber === null && value !== 0 ? null : (value as number);
}
