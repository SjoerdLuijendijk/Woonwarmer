import type { InvoiceSummary } from "./invoice-queries";

// The concepts, the sent invoices not yet paid in full, and what is still to be received on them.
// Concepts are not sent yet, so nothing is owed on them.
export function invoiceOverview(invoices: InvoiceSummary[]) {
  const drafts = invoices.filter((invoice) => invoice.draft);
  const unpaid = invoices.filter((invoice) => !invoice.draft && invoice.status !== "paid");
  const openCents = unpaid.reduce((sum, invoice) => sum + Math.max(0, invoice.totalCents - invoice.paidCents), 0);
  return { drafts, unpaid, openCents };
}
