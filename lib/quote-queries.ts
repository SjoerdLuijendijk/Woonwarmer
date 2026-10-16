import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPages } from "./all-pages";
import { lineImageUrls } from "./line-images";
import { lineTotalCents, type VatRate } from "./invoice";
import type { Quote, QuoteStatus, QuoteSummary } from "./quote";
import type { Condition, StoveType } from "./stoves";

type LineRow = { position: number; description: string; quantity: number; unit_price_cents: number; vat_rate: VatRate; margin_scheme: boolean; stove_number: number | null; article_id: number | null };

export async function listQuotes(supabase: SupabaseClient): Promise<QuoteSummary[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_number, status, issue_date, valid_until, customer_name, quote_lines (position, description, quantity, unit_price_cents)")
    .order("id", { ascending: false });
  if (error) throw error;

  return data.map((quote) => {
    const lines = [...(quote.quote_lines as Pick<LineRow, "position" | "description" | "quantity" | "unit_price_cents">[])].sort((a, b) => a.position - b.position);
    return {
      id: quote.id,
      number: quote.quote_number,
      status: quote.status as QuoteStatus,
      issueDate: quote.issue_date,
      validUntil: quote.valid_until,
      customerName: quote.customer_name,
      subject: lines[0]?.description ?? "",
      totalCents: lines.reduce((sum, line) => sum + line.quantity * line.unit_price_cents, 0),
    };
  });
}

export async function getQuote(supabase: SupabaseClient, id: number): Promise<Quote | null> {
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, issue_date, valid_until, customer_name, customer_address, customer_postal_code, customer_city, customer_email, customer_phone, notes, quote_lines (position, description, quantity, unit_price_cents, vat_rate, margin_scheme, stove_number, article_id)",
    )
    .eq("id", id)
    .order("position", { referencedTable: "quote_lines", ascending: true })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lines = data.quote_lines as LineRow[];
  const images = await lineImageUrls(supabase, lines);

  return {
    id: data.id,
    number: data.quote_number,
    status: data.status as QuoteStatus,
    issueDate: data.issue_date,
    validUntil: data.valid_until,
    customer: {
      name: data.customer_name,
      address: data.customer_address,
      postalCode: data.customer_postal_code,
      city: data.customer_city,
      email: data.customer_email,
      phone: data.customer_phone,
    },
    notes: data.notes,
    lines: lines.map(({ description, quantity, unit_price_cents, vat_rate, margin_scheme, stove_number, article_id }, index) => ({
      description,
      quantity,
      unit_price_cents,
      vat_rate,
      margin_scheme,
      stove_number,
      article_id,
      image_url: images[index],
    })),
  };
}

export const quoteTotalCents = (quote: Pick<Quote, "lines">) => quote.lines.reduce((sum, line) => sum + lineTotalCents(line), 0);

/** A stove that can be put on a quote. */
export type QuoteStoveOption = {
  number: number;
  brand: string;
  shopName: string | null;
  stoveType: StoveType | null;
  condition: Condition | null;
  madeToOrder: boolean;
  priceCents: number | null;
  sold: boolean;
};

// Stoves on offer (not sold out), newest first. Invoices also list sold stoves: a stove is often
// invoiced after it was marked sold.
export async function listQuoteStoves(supabase: SupabaseClient, { includeSold = false } = {}): Promise<QuoteStoveOption[]> {
  const data = await selectAllPages((from, to) => {
    let query = supabase.from("stoves").select("number, brand, shop_name, stove_type, condition, made_to_order, price_cents, sold_at");
    if (!includeSold) query = query.is("sold_at", null);
    return query.order("number", { ascending: false }).range(from, to);
  });
  return data.map((stove) => ({
    number: stove.number,
    brand: stove.brand,
    shopName: stove.shop_name,
    stoveType: stove.stove_type,
    condition: stove.condition,
    madeToOrder: stove.made_to_order,
    priceCents: stove.price_cents,
    sold: stove.sold_at !== null,
  }));
}
