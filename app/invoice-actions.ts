"use server";

import { revalidatePath } from "next/cache";
import { listArticles } from "../lib/article-queries";
import type { Article } from "../lib/articles";
import { requireTeamMember } from "../lib/auth";
import type { Company, Invoice } from "../lib/invoice";
import { getCompany, getInvoice } from "../lib/invoice-queries";
import { parseCompany, parseInvoiceInput } from "../lib/invoice-validation";
import type { ActionResult } from "./actions";

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de voorraad." } as const;
const FAILED = { ok: false, error: "Er ging iets mis. Probeer het opnieuw." } as const;

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

// What the invoice dialog needs: the seller details and the articles to pick lines from.
export async function getInvoiceSources(): Promise<ActionResult<{ company: Company | null; articles: Article[] }>> {
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  const [company, articles] = await Promise.all([getCompany(supabase), listArticles(supabase)]);
  return { ok: true, company, articles };
}

// stoveNumber null: a separate invoice that is not about a stove.
export async function createInvoice(stoveNumber: number | null, input: { customer: unknown; lines: unknown }): Promise<ActionResult<{ invoice: Invoice }>> {
  if (stoveNumber !== null && !isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };
  const parsed = parseInvoiceInput(input);
  if (!parsed.ok) return parsed;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase
    .rpc("create_invoice", { p_stove_number: stoveNumber, p_customer: parsed.value.customer, p_lines: parsed.value.lines })
    .single<{ id: number; invoice_number: string }>();
  if (error) {
    // Codes only; the payload contains customer data.
    console.error("Creating invoice failed", { code: error.code });
    if (error.message.includes("company settings missing")) {
      return { ok: false, error: "Vul eerst de bedrijfsgegevens in via het menu rechtsboven → Bedrijfsgegevens." };
    }
    return FAILED;
  }

  const invoice = await getInvoice(supabase, data.id);
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
