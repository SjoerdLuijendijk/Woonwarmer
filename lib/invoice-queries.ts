import type { SupabaseClient } from "@supabase/supabase-js";
import type { Company, Invoice } from "./invoice";

const COMPANY_COLUMNS = "name, address, postal_code, city, kvk_number, vat_number, iban, email, phone, payment_term_days, hourly_rate_ex_cents, invoice_footer";

export async function getCompany(supabase: SupabaseClient): Promise<Company | null> {
  const { data, error } = await supabase.from("company_settings").select(COMPANY_COLUMNS).maybeSingle();
  if (error) throw error;
  return data;
}

/** Stock of the invoiced stove, so the invoice dialog can offer to take the sold units from it. */
export type InvoiceStock = {
  quantity: number;
  madeToOrder: boolean;
  /** Sales placed with "Verkocht" and not delivered yet; each one already took a unit. */
  openSales: number;
};

// Null when the stove no longer exists.
export async function getInvoiceStock(supabase: SupabaseClient, stoveNumber: number): Promise<InvoiceStock | null> {
  const [stove, sales] = await Promise.all([
    supabase.from("stoves").select("stock_quantity, made_to_order").eq("number", stoveNumber).maybeSingle(),
    supabase.from("stove_notes").select("id", { count: "exact", head: true }).eq("stove_number", stoveNumber).eq("status", "sold"),
  ]);
  if (stove.error) throw stove.error;
  if (sales.error) throw sales.error;
  if (!stove.data) return null;
  return { quantity: stove.data.stock_quantity, madeToOrder: stove.data.made_to_order, openSales: sales.count ?? 0 };
}

export async function getInvoice(supabase: SupabaseClient, id: number): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "invoice_number, issue_date, stove_number, seller, customer_name, customer_address, customer_postal_code, customer_city, customer_email, customer_phone, invoice_lines (position, description, quantity, unit_price_cents, vat_rate, margin_scheme)",
    )
    .eq("id", id)
    .order("position", { referencedTable: "invoice_lines", ascending: true })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    number: data.invoice_number,
    issueDate: data.issue_date,
    stoveNumber: data.stove_number,
    seller: data.seller,
    customer: {
      name: data.customer_name,
      address: data.customer_address,
      postal_code: data.customer_postal_code,
      city: data.customer_city,
      email: data.customer_email,
      phone: data.customer_phone,
    },
    lines: data.invoice_lines.map(({ description, quantity, unit_price_cents, vat_rate, margin_scheme }) => ({
      description,
      quantity,
      unit_price_cents,
      vat_rate,
      margin_scheme,
    })),
  };
}

export type InvoiceSummary = {
  id: number;
  number: string;
  issueDate: string;
  stoveNumber: number | null;
  customerName: string;
  totalCents: number;
};

// All invoices, newest first. Invoices outlive their stove, so this does not depend on the stoves table.
export async function listInvoices(supabase: SupabaseClient): Promise<InvoiceSummary[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, issue_date, stove_number, customer_name, invoice_lines (quantity, unit_price_cents)")
    .order("id", { ascending: false });
  if (error) throw error;

  return data.map((invoice) => ({
    id: invoice.id,
    number: invoice.invoice_number,
    issueDate: invoice.issue_date,
    stoveNumber: invoice.stove_number,
    customerName: invoice.customer_name,
    totalCents: invoice.invoice_lines.reduce((sum, line) => sum + line.quantity * line.unit_price_cents, 0),
  }));
}
