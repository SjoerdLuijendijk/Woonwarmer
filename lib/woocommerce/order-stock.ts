import type { SupabaseClient } from "@supabase/supabase-js";
import { getWooCommerceConfig, WooCommerceError, wooRequest } from "./client";
import { syncStoveToShop } from "./sync";

// Server-only. Keeps the app's stock in line with the web shop after a shop order: WooCommerce
// lowers (and on a cancellation or refund restores) the stock itself, and the app copies the
// resulting stock of each stove in the order. Copying instead of subtracting makes repeated or
// out-of-order webhooks harmless. Made-to-order stoves are skipped: their shop stock is not real
// (see ./stock.ts).

type OrderLine = { product_id?: unknown };
type ShopStock = { id: number; manage_stock: boolean; stock_quantity: number | null };

// The largest stock the database accepts.
const MAX_STOCK = 10_000;

export function orderProductIds(order: unknown): number[] {
  const lines = (order as { line_items?: unknown })?.line_items;
  if (!Array.isArray(lines)) return [];
  const ids = lines.map((line: OrderLine) => line?.product_id).filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0);
  return [...new Set(ids)];
}

// Returns the stove numbers whose stock changed.
export async function copyShopStockToApp(supabase: SupabaseClient, productIds: number[]): Promise<number[]> {
  if (productIds.length === 0) return [];
  const config = getWooCommerceConfig();
  if (!config) throw new WooCommerceError("De webshopkoppeling is nog niet ingesteld.");

  const { data: stoves, error } = await supabase
    .from("stoves")
    .select("number, condition, stock_quantity, shop_product_id")
    .in("shop_product_id", productIds)
    .eq("made_to_order", false);
  if (error) throw error;
  if (stoves.length === 0) return [];

  const query = new URLSearchParams({
    include: stoves.map((stove) => stove.shop_product_id).join(","),
    per_page: "100",
    _fields: "id,manage_stock,stock_quantity",
  });
  const products = await wooRequest<ShopStock[]>(config, "GET", `/products?${query}`);
  const productById = new Map(products.map((product) => [product.id, product]));

  const changed: number[] = [];
  for (const stove of stoves) {
    const product = productById.get(stove.shop_product_id);
    if (!product?.manage_stock || product.stock_quantity === null) continue;
    // A used stove is a single unit; WooCommerce can go below zero when backorders slip through.
    const max = stove.condition === "used" ? 1 : MAX_STOCK;
    const stock = Math.min(Math.max(product.stock_quantity, 0), max);
    if (stock === stove.stock_quantity) continue;

    const { error: updateError } = await supabase.from("stoves").update({ stock_quantity: stock }).eq("number", stove.number);
    if (updateError) throw updateError;
    changed.push(stove.number);
    // At stock 0 the database unlists the stove; this takes the shop product offline too.
    await syncStoveToShop(supabase, stove.number);
  }
  return changed;
}
