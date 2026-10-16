import { MAX_PRICE_CENTS, parsePriceToCents } from "./price";

// Payments on invoices (table invoice_payments). Keep in sync with the migration's checks.
export const INVOICE_PAYMENT_METHOD_LABELS = { cash: "Contant", pin: "Pin", bank: "Bank", online: "Webshop" } as const;
export type InvoicePaymentMethod = keyof typeof INVOICE_PAYMENT_METHOD_LABELS;
export const MAX_PAYMENT_NOTE_LENGTH = 200;

export type InvoicePayment = { id: number; paidOn: string; amountCents: number; method: InvoicePaymentMethod; note: string | null };

export type PaymentStatus = "open" | "partial" | "paid";
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = { open: "Open", partial: "Deels betaald", paid: "Betaald" };

/** Paid when marked so, or when the payments cover the total; partly paid with some payments. */
export function paymentStatus(totalCents: number, paidCents: number, markedPaid: boolean): PaymentStatus {
  if (markedPaid || (totalCents > 0 && paidCents >= totalCents) || totalCents <= 0) return "paid";
  return paidCents > 0 ? "partial" : "open";
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isMethod = (value: unknown): value is InvoicePaymentMethod => typeof value === "string" && value in INVOICE_PAYMENT_METHOD_LABELS;

// Validates a payment from the payments dialog.
export function parsePayment(input: unknown): Result<{ paid_on: string; amount_cents: number; method: InvoicePaymentMethod; note: string | null }> {
  const raw = (typeof input === "object" && input) || {};
  const { paidOn, amount, method, note } = raw as Record<string, unknown>;
  if (typeof paidOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn))) {
    return { ok: false, error: "Vul een geldige datum in." };
  }
  const cents = typeof amount === "string" ? parsePriceToCents(amount) : null;
  if (cents === null || cents > MAX_PRICE_CENTS) return { ok: false, error: "Vul een bedrag in, bijvoorbeeld 250 of 99,50." };
  if (!isMethod(method)) return { ok: false, error: "Kies hoe er is betaald." };
  const cleanNote = typeof note === "string" ? note.trim() : "";
  if (cleanNote.length > MAX_PAYMENT_NOTE_LENGTH) return { ok: false, error: "De opmerking is te lang." };
  return { ok: true, value: { paid_on: paidOn, amount_cents: cents, method, note: cleanNote || null } };
}
