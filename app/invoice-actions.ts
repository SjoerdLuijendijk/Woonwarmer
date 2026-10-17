"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { listArticles } from "../lib/article-queries";
import type { Article } from "../lib/articles";
import { requireTeamMember } from "../lib/auth";
import type { Company, Invoice } from "../lib/invoice";
import { getCompany, getInvoice, getInvoiceStock, type InvoiceStock } from "../lib/invoice-queries";
import { parseCompany, parseInvoiceInput, parseStockDeduction } from "../lib/invoice-validation";
import { lineImageUrls } from "../lib/line-images";
import { listQuoteStoves, type QuoteStoveOption } from "../lib/quote-queries";
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
  revalidatePath("/", "layout");
  return { ok: true };
}

// What the invoice dialogs need: the seller details and the articles to pick lines from, and for a
// separate invoice also the stoves (sold ones included).
export async function getInvoiceSources(
  { withStoves = false } = {},
): Promise<ActionResult<{ company: Company | null; articles: Article[]; stoves: QuoteStoveOption[] | null }>> {
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  const [company, articles, stoves] = await Promise.all([
    getCompany(supabase),
    listArticles(supabase),
    withStoves ? listQuoteStoves(supabase, { includeSold: true }) : null,
  ]);
  return { ok: true, company, articles, stoves };
}

// Stock of the invoiced stove, so the invoice dialog can offer to take the sold units from it; null
// for a stove that no longer exists.
export async function getStoveStockForInvoice(stoveNumber: number): Promise<ActionResult<{ stock: InvoiceStock | null }>> {
  if (!isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  return { ok: true, stock: await getInvoiceStock(supabase, stoveNumber) };
}

const MAX_IMAGE_SOURCES = 100;

// Photos for the lines of a draft invoice or quote (the PDF preview), one per source in order.
export async function getLineImageUrls(sources: unknown): Promise<ActionResult<{ urls: (string | null)[] }>> {
  if (!Array.isArray(sources) || sources.length > MAX_IMAGE_SOURCES) return { ok: false, error: "Te veel regels." };
  const clean = sources.map((source) => {
    const { stove_number: stoveNumber, article_id: articleId } = (typeof source === "object" && source) || {};
    return { stove_number: isPositiveId(stoveNumber) ? stoveNumber : null, article_id: isPositiveId(articleId) ? articleId : null };
  });
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  return { ok: true, urls: await lineImageUrls(supabase, clean) };
}

function companyMissing(message: string) {
  return message.includes("company settings missing")
    ? ({ ok: false, error: "Vul eerst de bedrijfsgegevens in via het menu rechtsboven → Bedrijfsgegevens." } as const)
    : null;
}

// Saves a concept invoice: a new one (invoiceId null) or the changed customer and lines of an existing
// concept. stoveNumber null: a separate invoice that is not about a stove. A concept has no number yet.
export async function saveDraftInvoice(
  invoiceId: number | null,
  stoveNumber: number | null,
  input: { customer: unknown; lines: unknown },
): Promise<ActionResult<{ id: number; invoice: Invoice }>> {
  if (invoiceId !== null && !isPositiveId(invoiceId)) return { ok: false, error: "Onbekende factuur." };
  if (stoveNumber !== null && !isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };
  const parsed = parseInvoiceInput(input);
  if (!parsed.ok) return parsed;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase.rpc("save_draft_invoice", {
    p_invoice_id: invoiceId,
    p_stove_number: stoveNumber,
    p_customer: parsed.value.customer,
    p_lines: parsed.value.lines,
  });
  if (error) {
    // Codes only; the payload contains customer data.
    console.error("Saving draft invoice failed", { code: error.code });
    if (error.message.includes("not a draft")) return { ok: false, error: "Deze factuur is al verstuurd en kan niet meer worden gewijzigd." };
    return companyMissing(error.message) ?? FAILED;
  }
  const id = data as number;
  const invoice = await getInvoice(supabase, id);
  if (!invoice) return FAILED;
  revalidatePath("/", "layout");
  return { ok: true, id, invoice };
}

// Marks a concept sent: it gets the next number and today's date and can no longer change.
// stockDeduction: the units of its stove that leave the stock, in the same transaction.
export async function finalizeInvoice(invoiceId: number, stockDeduction: unknown): Promise<ActionResult<{ invoice: Invoice }>> {
  if (!isPositiveId(invoiceId)) return { ok: false, error: "Onbekende factuur." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data: draft, error: findError } = await supabase.from("invoices").select("stove_number").eq("id", invoiceId).maybeSingle();
  if (findError) return FAILED;
  if (!draft) return { ok: false, error: "Factuur niet gevonden." };
  const deduction = parseStockDeduction(stockDeduction, draft.stove_number);
  if (deduction === null) return { ok: false, error: "Het aantal om van de voorraad af te halen klopt niet." };

  const { error } = await supabase.rpc("finalize_invoice", { p_invoice_id: invoiceId, p_stock_deduction: deduction });
  if (error) {
    console.error("Finalizing invoice failed", { code: error.code });
    if (error.message.includes("not a draft")) return { ok: false, error: "Deze factuur is al verstuurd." };
    if (error.code === CHECK_VIOLATION) {
      return { ok: false, error: "Er staan minder kachels op voorraad dan deze factuur afboekt. De factuur is nog een concept; ververs de pagina en controleer de voorraad." };
    }
    if (error.message.includes("stove keeps no stock")) {
      return { ok: false, error: "Deze kachel is op bestelling en heeft geen voorraad. Zet het vinkje voor de voorraad uit." };
    }
    return companyMissing(error.message) ?? FAILED;
  }

  // The stock changed, which the web shop shows (a sold-out stove goes offline).
  if (deduction > 0 && draft.stove_number !== null) {
    const stoveNumber = draft.stove_number as number;
    after(() => syncStoveToShop(supabase, stoveNumber));
  }
  const invoice = await getInvoice(supabase, invoiceId);
  if (!invoice) return FAILED;
  revalidatePath("/", "layout");
  return { ok: true, invoice };
}

export async function deleteDraftInvoice(invoiceId: number): Promise<ActionResult> {
  if (!isPositiveId(invoiceId)) return { ok: false, error: "Onbekende factuur." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  const { error } = await supabase.rpc("delete_draft_invoice", { p_invoice_id: invoiceId });
  if (error) {
    if (error.message.includes("not a draft")) return { ok: false, error: "Een verstuurde factuur kan niet worden verwijderd." };
    return FAILED;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function getInvoiceForPdf(invoiceId: number): Promise<ActionResult<{ invoice: Invoice }>> {
  if (!isPositiveId(invoiceId)) return { ok: false, error: "Onbekende factuur." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const invoice = await getInvoice(supabase, invoiceId);
  return invoice ? { ok: true, invoice } : { ok: false, error: "Factuur niet gevonden." };
}
