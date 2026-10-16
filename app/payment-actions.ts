"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "../lib/auth";
import { parsePayment } from "../lib/invoice-payments";
import { WooCommerceError } from "../lib/woocommerce/client";
import { fetchShopOrders, toShopInvoice, type ShopInvoiceSkip } from "../lib/woocommerce/shop-invoices";
import type { ActionResult } from "./actions";

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de facturen." } as const;
const FAILED = { ok: false, error: "Er ging iets mis. Probeer het opnieuw." } as const;

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

// Adds a (part) payment to an invoice.
export async function addInvoicePayment(invoiceId: number, input: unknown): Promise<ActionResult> {
  if (!isPositiveId(invoiceId)) return { ok: false, error: "Onbekende factuur." };
  const parsed = parsePayment(input);
  if (!parsed.ok) return parsed;
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { error } = await supabase.from("invoice_payments").insert({ invoice_id: invoiceId, ...parsed.value });
  if (error) {
    console.error("Adding invoice payment failed", { code: error.code });
    return error.code === "23503" ? { ok: false, error: "Factuur niet gevonden." } : FAILED;
  }
  revalidatePath("/");
  return { ok: true };
}

export async function deleteInvoicePayment(paymentId: number): Promise<ActionResult> {
  if (!isPositiveId(paymentId)) return { ok: false, error: "Onbekende betaling." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  const { error } = await supabase.from("invoice_payments").delete().eq("id", paymentId);
  if (error) return FAILED;
  revalidatePath("/");
  return { ok: true };
}

// Marks an invoice paid without (or besides) recorded payments, or takes the mark away again.
export async function setInvoicePaid(invoiceId: number, paid: unknown): Promise<ActionResult> {
  if (!isPositiveId(invoiceId) || typeof paid !== "boolean") return { ok: false, error: "Onbekende factuur." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  const { data, error } = await supabase
    .from("invoices")
    .update({ paid_at: paid ? new Date().toISOString() : null })
    .eq("id", invoiceId)
    .select("id");
  if (error || data.length === 0) return FAILED;
  revalidatePath("/");
  return { ok: true };
}

export type ShopImportReport = { orders: number; imported: number; existing: number; withoutNumber: number; skipped: ShopInvoiceSkip[] };

const IMPORT_YEAR = 2026;

// Facturen → "Webshopfacturen ophalen": the shop's invoices of 2026, once. Running it again only adds
// orders that are not in the app yet.
export async function importShopInvoices(): Promise<ActionResult<{ report: ShopImportReport }>> {
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  let orders;
  try {
    orders = await fetchShopOrders(IMPORT_YEAR);
  } catch (error) {
    return { ok: false, error: error instanceof WooCommerceError ? error.message : "De webshop kon niet worden gelezen." };
  }

  const report: ShopImportReport = { orders: orders.length, imported: 0, existing: 0, withoutNumber: 0, skipped: [] };
  for (const order of orders) {
    const invoice = toShopInvoice(order, IMPORT_YEAR);
    if (!("customer" in invoice)) {
      // Orders without an invoice number were never invoiced; they are only counted.
      if (invoice.number === null) report.withoutNumber += 1;
      else report.skipped.push(invoice);
      continue;
    }
    const { data, error } = await supabase.rpc("import_shop_invoice", {
      p_order_id: invoice.orderId,
      p_number: invoice.number,
      p_issue_date: invoice.issueDate,
      p_customer: invoice.customer,
      p_lines: invoice.lines,
      p_paid_on: invoice.paidOn,
      p_payment_method: invoice.paymentMethod,
    });
    if (error) {
      // Codes only; the payload holds customer data.
      console.error("Importing shop invoice failed", { code: error.code, order: invoice.orderId });
      const reason = error.code === "23505" ? "nummer bestaat al in de app" : error.message.includes("company settings") ? "bedrijfsgegevens ontbreken" : "kon niet worden opgeslagen";
      report.skipped.push({ orderId: invoice.orderId, number: invoice.number, reason });
      continue;
    }
    if (data === null) report.existing += 1;
    else report.imported += 1;
  }
  revalidatePath("/");
  return { ok: true, report };
}
