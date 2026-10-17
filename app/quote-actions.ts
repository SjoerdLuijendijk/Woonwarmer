"use server";

import { revalidatePath } from "next/cache";
import { listArticles } from "../lib/article-queries";
import type { Article } from "../lib/articles";
import { requireTeamMember } from "../lib/auth";
import type { Company } from "../lib/invoice";
import { getCompany } from "../lib/invoice-queries";
import { parseQuoteInput, QUOTE_STATUS_LABELS, type Quote, type QuoteStatus } from "../lib/quote";
import { getQuote, listQuoteStoves, type QuoteStoveOption } from "../lib/quote-queries";
import { todayInNetherlands } from "../lib/today";
import type { ActionResult } from "./actions";

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de offertes." } as const;
const FAILED = { ok: false, error: "Er ging iets mis. Probeer het opnieuw." } as const;

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

// What the quote dialog needs: company details for the PDF, stoves on offer and the articles.
export async function getQuoteSources(): Promise<ActionResult<{ company: Company | null; stoves: QuoteStoveOption[]; articles: Article[] }>> {
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  const [company, stoves, articles] = await Promise.all([getCompany(supabase), listQuoteStoves(supabase), listArticles(supabase)]);
  return { ok: true, company, stoves, articles };
}

export async function getQuoteForPdf(id: number): Promise<ActionResult<{ quote: Quote; company: Company | null }>> {
  if (!isPositiveId(id)) return { ok: false, error: "Onbekende offerte." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  const [quote, company] = await Promise.all([getQuote(supabase, id), getCompany(supabase)]);
  return quote ? { ok: true, quote, company } : { ok: false, error: "Offerte niet gevonden." };
}

// Creates a quote (id null) or replaces its content. Typed lines marked "Opslaan in artikelen" are
// added to the article list first and linked to it.
export async function saveQuote(id: number | null, input: unknown): Promise<ActionResult<{ quote: Quote }>> {
  if (id !== null && !isPositiveId(id)) return { ok: false, error: "Onbekende offerte." };
  const parsed = parseQuoteInput(input, todayInNetherlands());
  if (!parsed.ok) return parsed;
  const { customer, validUntil, notes, lines } = parsed.value;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  for (const line of lines) {
    if (!line.save_as_article || line.article_id !== null || line.stove_number !== null) continue;
    const { data, error } = await supabase
      .from("articles")
      .insert({
        name: line.description,
        // Articles keep prices excluding VAT, as in the supplier CSV.
        sale_price_ex_cents: Math.round((line.unit_price_cents * 100) / (100 + line.vat_rate)),
        vat_rate: line.vat_rate,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: "De regel kon niet in de artikelen worden opgeslagen. Probeer het opnieuw." };
    line.article_id = data.id;
  }

  const { data, error } = await supabase
    .rpc("save_quote", {
      p_quote_id: id,
      p_quote: {
        valid_until: validUntil,
        customer_name: customer.name,
        customer_address: customer.address ?? "",
        customer_postal_code: customer.postalCode ?? "",
        customer_city: customer.city ?? "",
        customer_email: customer.email ?? "",
        customer_phone: customer.phone ?? "",
        notes: notes ?? "",
      },
      p_lines: lines.map(({ description, quantity, unit_price_cents, vat_rate, margin_scheme, stove_number, article_id }) => ({
        description,
        quantity,
        unit_price_cents,
        vat_rate,
        margin_scheme,
        stove_number,
        article_id,
      })),
    })
    .single<{ id: number; quote_number: string }>();
  if (error) {
    // Codes only; the payload contains customer data.
    console.error("Saving quote failed", { code: error.code });
    return FAILED;
  }

  const quote = await getQuote(supabase, data.id);
  if (!quote) return FAILED;
  revalidatePath("/", "layout");
  return { ok: true, quote };
}

export async function setQuoteStatus(id: number, status: QuoteStatus): Promise<ActionResult> {
  if (!isPositiveId(id) || !Object.hasOwn(QUOTE_STATUS_LABELS, status)) return { ok: false, error: "Onbekende offerte." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase.from("quotes").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return FAILED;
  if (data.length === 0) return { ok: false, error: "Deze offerte bestaat niet meer." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteQuote(id: number): Promise<ActionResult> {
  if (!isPositiveId(id)) return { ok: false, error: "Onbekende offerte." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) return FAILED;
  revalidatePath("/", "layout");
  return { ok: true };
}
