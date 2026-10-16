"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { listArticles } from "../lib/article-queries";
import type { Article } from "../lib/articles";
import { requireTeamMember } from "../lib/auth";
import type { Company, Invoice } from "../lib/invoice";
import { getCompany, getInvoice, getInvoiceStock, type InvoiceStock } from "../lib/invoice-queries";
import { parseCompany, parseInvoiceInput, parseStockDeduction } from "../lib/invoice-validation";
import { syncStoveToShop } from "../lib/woocommerce/sync";
import type { ActionResult } from "./actions";

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de voorraad." } as const;
const FAILED = { ok: false, error: "Er ging iets mis. Probeer het opnieuw." } as const;
// Postgres error code for a violated check constraint: fewer units in stock than the invoice takes.
const CHECK_VIOLATION = "23514";

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export async function saveCompanySettings(formData: FormData): Promise<ActionResult> {
  const parsed = parseCompany(formData);
  if (!parsed.ok) return parsed;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { error } = await supabase
    .from("company_settings")
    .upsert({ id: true, ...parsed.value, updated_at: new Date().toISOString() });
  if (error) {
    console.error("Saving company settings failed", { code: error.code });
    return FAILED;
  }
  revalidatePath("/");
  return { ok: true };
}

// What the invoice dialog needs: the seller details, the articles to pick lines from, and the stock
// of the invoiced stove (null for a separate invoice or a stove that no longer exists).
export async function getInvoiceSources(
  stoveNumber: number | null,
): Promise<ActionResult<{ company: Company | null; articles: Article[]; stock: InvoiceStock | null }>> {
  if (stoveNumber !== null && !isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  const [company, articles, stock] = await Promise.all([
    getCompany(supabase),
    listArticles(supabase),
    stoveNumber === null ? null : getInvoiceStock(supabase, stoveNumber),
  ]);
  return { ok: true, company, articles, stock };
}

// stoveNumber null: a separate invoice that is not about a stove. stockDeduction: the units of the stove
// this invoice takes from its stock, in the same transaction as the invoice.
export async function createInvoice(
  stoveNumber: number | null,
  input: { customer: unknown; lines: unknown; stockDeduction: unknown },
): Promise<ActionResult<{ invoice: Invoice }>> {
  if (stoveNumber !== null && !isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };
  const parsed = parseInvoiceInput(input);
  if (!parsed.ok) return parsed;
  const stockDeduction = parseStockDeduction(input.stockDeduction, stoveNumber);
  if (stockDeduction === null) return { ok: false, error: "Het aantal om van de voorraad af te halen klopt niet." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase
    .rpc("create_invoice", {
      p_stove_number: stoveNumber,
      p_customer: parsed.value.customer,
      p_lines: parsed.value.lines,
      p_stock_deduction: stockDeduction,
    })
    .single<{ id: number; invoice_number: string }>();
  if (error) {
    // Codes only; the payload contains customer data.
    console.error("Creating invoice failed", { code: error.code });
    if (error.message.includes("company settings missing")) {
      return { ok: false, error: "Vul eerst de bedrijfsgegevens in via het menu rechtsboven → Bedrijfsgegevens." };
    }
    if (error.code === CHECK_VIOLATION) {
      return { ok: false, error: "Er staan minder kachels op voorraad dan deze factuur afboekt. De factuur is niet gemaakt; ververs de pagina en controleer de voorraad." };
    }
    if (error.message.includes("stove keeps no stock")) {
      return { ok: false, error: "Deze kachel is op bestelling en heeft geen voorraad. Zet het vinkje voor de voorraad uit." };
    }
    return FAILED;
  }

  // The stock changed, which the web shop shows (a sold-out stove goes offline).
  if (stockDeduction > 0 && stoveNumber !== null) after(() => syncStoveToShop(supabase, stoveNumber));
  const invoice = await getInvoice(supabase, data.id);
  if (!invoice) return FAILED;
  revalidatePath("/");
  return { ok: true, invoice };
}

// Corrects the customer and lines of an existing invoice; number, date, seller and stock stay as they were.
export async function updateInvoice(
  invoiceId: number,
  input: { customer: unknown; lines: unknown },
): Promise<ActionResult<{ invoice: Invoice }>> {
  if (!isPositiveId(invoiceId)) return { ok: false, error: "Onbekende factuur." };
  const parsed = parseInvoiceInput(input);
  if (!parsed.ok) return parsed;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { error } = await supabase.rpc("update_invoice", {
    p_invoice_id: invoiceId,
    p_customer: parsed.value.customer,
    p_lines: parsed.value.lines,
  });
  if (error) {
    // Codes only; the payload contains customer data.
    console.error("Updating invoice failed", { code: error.code });
    if (error.message.includes("unknown invoice")) return { ok: false, error: "Factuur niet gevonden." };
    return FAILED;
  }

  const invoice = await getInvoice(supabase, invoiceId);
  if (!invoice) return FAILED;
  revalidatePath("/");
  return { ok: true, invoice };
}

export async function getInvoiceForPdf(invoiceId: number): Promise<ActionResult<{ invoice: Invoice }>> {
  if (!isPositiveId(invoiceId)) return { ok: false, error: "Onbekende factuur." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const invoice = await getInvoice(supabase, invoiceId);
  return invoice ? { ok: true, invoice } : { ok: false, error: "Factuur niet gevonden." };
}
