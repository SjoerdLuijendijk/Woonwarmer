import type { Customer, InvoiceLine, VatRate } from "../invoice";
import { getWooCommerceConfig, WooCommerceError, wooRequest } from "./client";

// Server-only. Reads the web shop's invoices of one year (orders with a number from the shop's PDF
// invoice plugin) and turns each into the app's invoice shape. Personal data stays on the server:
// the import report only names invoice and order numbers.

type Money = string | number | null | undefined;
type ShopLine = { name?: string; method_title?: string; quantity?: number; total?: Money; total_tax?: Money };
type ShopOrder = {
  id: number;
  status: string;
  date_created?: string | null;
  date_paid?: string | null;
  date_completed?: string | null;
  payment_method?: string | null;
  total?: Money;
  billing?: Record<string, string | undefined>;
  line_items?: ShopLine[];
  shipping_lines?: ShopLine[];
  fee_lines?: ShopLine[];
  meta_data?: { key: string; value: unknown }[];
};

export type ShopInvoice = {
  orderId: number;
  number: number;
  issueDate: string;
  customer: Customer;
  lines: InvoiceLine[];
  paidOn: string | null;
  paymentMethod: "cash" | "bank" | "online";
};

export type ShopInvoiceSkip = { orderId: number; number: number | null; reason: string };

// Orders that count as invoiced; cancelled, failed, refunded and unpaid drafts are left out.
const INVOICED_STATUSES = new Set(["completed", "processing", "on-hold"]);
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

const cents = (value: Money) => Math.round(Number(value ?? 0) * 100);

function decode(text: string) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#8217;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const limit = (text: string, max: number) => text.slice(0, max);

function meta(order: ShopOrder, key: string) {
  return order.meta_data?.find((item) => item.key === key)?.value;
}

function invoiceNumber(order: ShopOrder): number | null {
  const data = meta(order, "_wcpdf_invoice_number_data") as { number?: unknown } | undefined;
  const raw = meta(order, "_wcpdf_invoice_number") ?? data?.number;
  const number = Number(String(raw ?? "").replace(/\D/g, ""));
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

// The invoice date the plugin stored (a Unix timestamp), else the order date; as a Dutch calendar day.
function issueDate(order: ShopOrder): string | null {
  const stamp = Number(meta(order, "_wcpdf_invoice_date"));
  if (Number.isFinite(stamp) && stamp > 0) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date(stamp * 1000));
  }
  return order.date_created?.slice(0, 10) ?? null;
}

// Prices include VAT. A line without VAT is a used stove under the margin scheme (or free shipping).
function toLine(name: string, line: ShopLine, product: boolean): InvoiceLine {
  const incl = cents(line.total) + cents(line.total_tax);
  const tax = cents(line.total_tax);
  const quantity = Number.isSafeInteger(line.quantity) && (line.quantity as number) >= 1 ? (line.quantity as number) : 1;
  const exact = quantity <= 1000 && incl % quantity === 0;
  // The rate nearest to the tax the shop charged.
  const ratio = tax / Math.max(1, Math.abs(cents(line.total)));
  const vatRate: VatRate = tax === 0 ? 0 : Math.abs(ratio - 0.09) < Math.abs(ratio - 0.21) ? 9 : 21;
  return {
    description: limit(exact ? name : `${quantity}× ${name}`, 200) || "Webshopartikel",
    quantity: exact ? quantity : 1,
    unit_price_cents: exact ? incl / quantity : incl,
    vat_rate: vatRate,
    margin_scheme: product && tax === 0,
  };
}

export function toShopInvoice(order: ShopOrder, year: number): ShopInvoice | ShopInvoiceSkip {
  const number = invoiceNumber(order);
  const skip = (reason: string): ShopInvoiceSkip => ({ orderId: order.id, number, reason });
  if (number === null) return skip("geen factuurnummer");
  if (!INVOICED_STATUSES.has(order.status)) return skip(`status ${order.status}`);
  const date = issueDate(order);
  if (!date || Number(date.slice(0, 4)) !== year) return skip("factuurdatum niet in " + year);

  const lines = [
    ...(order.line_items ?? []).map((line) => toLine(decode(line.name ?? ""), line, true)),
    ...(order.shipping_lines ?? []).filter((line) => cents(line.total) + cents(line.total_tax) !== 0).map((line) => toLine(`Verzending: ${decode(line.method_title ?? "")}`, line, false)),
    ...(order.fee_lines ?? []).map((line) => toLine(decode(line.name ?? "Toeslag"), line, false)),
  ];
  if (lines.length === 0 || lines.length > 50) return skip(`${lines.length} regels`);
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unit_price_cents, 0);
  if (total !== cents(order.total)) return skip("regels tellen niet op tot het totaal");

  const billing = order.billing ?? {};
  const name = decode(billing.company?.trim() || `${billing.first_name ?? ""} ${billing.last_name ?? ""}`) || "Webshopklant";
  const method = order.payment_method === "bacs" || order.payment_method === "cheque" ? "bank" : order.payment_method === "cod" ? "cash" : "online";
  const paid = order.date_paid ?? (order.status === "completed" ? order.date_completed : null);

  return {
    orderId: order.id,
    number,
    issueDate: date,
    customer: {
      name: limit(name, 200),
      address: limit(decode(`${billing.address_1 ?? ""} ${billing.address_2 ?? ""}`) || "—", 200),
      postal_code: limit(decode(billing.postcode ?? "") || "—", 20),
      city: limit(decode(billing.city ?? "") || "—", 100),
      email: billing.email ? limit(billing.email.trim(), 320) : null,
      phone: billing.phone ? limit(billing.phone.trim(), 40) : null,
    },
    lines,
    paidOn: paid ? paid.slice(0, 10) : null,
    paymentMethod: method,
  };
}

/** All shop orders created from a month before the year on; their invoice date decides. */
export async function fetchShopOrders(year: number): Promise<ShopOrder[]> {
  const config = getWooCommerceConfig();
  if (!config) throw new WooCommerceError("De webshopkoppeling is nog niet ingesteld.");
  const orders: ShopOrder[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      after: `${year - 1}-12-01T00:00:00`,
      per_page: String(PAGE_SIZE),
      page: String(page),
      orderby: "id",
      order: "asc",
    });
    const batch = await wooRequest<ShopOrder[]>(config, "GET", `/orders?${query}`);
    orders.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return orders;
}
