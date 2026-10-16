import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPages } from "./all-pages";
import type { Company, Invoice } from "./invoice";
import { paymentStatus, type InvoicePayment, type InvoicePaymentMethod, type PaymentStatus } from "./invoice-payments";
import { lineImageUrls } from "./line-images";

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
      "invoice_number, status, issue_date, stove_number, seller, customer_name, customer_address, customer_postal_code, customer_city, customer_email, customer_phone, invoice_lines (position, description, quantity, unit_price_cents, vat_rate, margin_scheme, stove_number, article_id)",
    )
    .eq("id", id)
    .order("position", { referencedTable: "invoice_lines", ascending: true })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const images = await lineImageUrls(supabase, data.invoice_lines);

  return {
    number: data.invoice_number,
    status: data.status,
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
    lines: data.invoice_lines.map(({ description, quantity, unit_price_cents, vat_rate, margin_scheme, stove_number, article_id }, index) => ({
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

export type InvoiceSummary = {
  id: number;
  /** Null for a concept. */
  number: string | null;
  /** A concept is still being written; it counts towards nothing until it is sent. */
  draft: boolean;
  issueDate: string;
  stoveNumber: number | null;
  customerName: string;
  totalCents: number;
  /** Invoices of the web shop (before the app took over) are read-only. */
  source: "app" | "webshop";
  paidCents: number;
  markedPaid: boolean;
  status: PaymentStatus;
  payments: InvoicePayment[];
};

type InvoiceListRow = {
  id: number;
  invoice_number: string | null;
  status: "draft" | "sent";
  issue_date: string;
  stove_number: number | null;
  customer_name: string;
  source: "app" | "webshop";
  paid_at: string | null;
  invoice_lines: { quantity: number; unit_price_cents: number }[];
  invoice_payments: { id: number; paid_on: string; amount_cents: number; method: InvoicePaymentMethod; note: string | null }[];
};

// All invoices, highest number first, with their payments. Invoices outlive their stove, so this
// does not depend on the stoves table.
export async function listInvoices(supabase: SupabaseClient): Promise<InvoiceSummary[]> {
  const rows = await selectAllPages<InvoiceListRow>((from, to) =>
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, status, issue_date, stove_number, customer_name, source, paid_at, invoice_lines (quantity, unit_price_cents), invoice_payments (id, paid_on, amount_cents, method, note)",
      )
      // Concepts (no number yet) first, then the highest number.
      .order("sequence_number", { ascending: false, nullsFirst: true })
      .order("id", { ascending: false })
      .order("paid_on", { referencedTable: "invoice_payments", ascending: true })
      .range(from, to)
      .overrideTypes<InvoiceListRow[], { merge: false }>(),
  );

  return rows.map((invoice) => {
    const totalCents = invoice.invoice_lines.reduce((sum, line) => sum + line.quantity * line.unit_price_cents, 0);
    const paidCents = invoice.invoice_payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
    return {
      id: invoice.id,
      number: invoice.invoice_number,
      draft: invoice.status === "draft",
      issueDate: invoice.issue_date,
      stoveNumber: invoice.stove_number,
      customerName: invoice.customer_name,
      totalCents,
      source: invoice.source,
      paidCents,
      markedPaid: invoice.paid_at !== null,
      status: paymentStatus(totalCents, paidCents, invoice.paid_at !== null),
      payments: invoice.invoice_payments.map((payment) => ({
        id: payment.id,
        paidOn: payment.paid_on,
        amountCents: payment.amount_cents,
        method: payment.method,
        note: payment.note,
      })),
    };
  });
}
