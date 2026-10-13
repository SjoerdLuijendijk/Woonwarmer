import type { SupabaseClient } from "@supabase/supabase-js";
import { getWooCommerceConfig, WooCommerceError, wooRequest } from "./client";
import { stoveChangesFromShop, type CurrentStove, type ShopProductState } from "./shop-changes";

// Server-only. Brings every stove with a web shop product in line with the shop in one go (stock,
// title, price, attributes, online status), with the team member's own client. Only reads from the
// shop. The rules are in shop-changes.ts; new products are imported separately.

type StoveRow = CurrentStove & Record<string, unknown> & { number: number; shop_product_id: number; shop_sync_error: string | null };

export type RefreshedStove = { number: number; fields: string[] };
export type ShopRefreshResult = {
  changed: RefreshedStove[];
  unchanged: number;
  skipped: { number: number; reason: string }[];
};

// WooCommerce returns at most 100 products per page.
const PAGE_SIZE = 100;
const STOVE_COLUMNS =
  "number, shop_product_id, shop_sync_error, brand, condition, stove_type, height_cm, width_cm, depth_cm, weight_kg, flue_outlet, flue_diameter_mm, flue_center_height_cm, power_kw, min_power_kw, max_power_kw, external_air_supply, new_firebox, thermostat, efficiency_percent, energy_label, warranty_years, material, description, marketplace_ad, price_cents, made_to_order, stock_quantity, shop_listed";

// How a changed column is named in the result; the remaining columns are product details.
const FIELD_LABELS: Record<string, string> = {
  stock_quantity: "voorraad",
  made_to_order: "op bestelling",
  shop_listed: "online",
  price_cents: "prijs",
  description: "beschrijving",
  brand: "merk",
  condition: "staat",
};

async function fetchProducts(config: NonNullable<ReturnType<typeof getWooCommerceConfig>>, ids: number[]) {
  const products = new Map<number, ShopProductState & { id: number }>();
  for (let start = 0; start < ids.length; start += PAGE_SIZE) {
    const chunk = ids.slice(start, start + PAGE_SIZE);
    const page = await wooRequest<(ShopProductState & { id: number })[]>(
      config,
      "GET",
      `/products?status=any&per_page=${PAGE_SIZE}&include=${chunk.join(",")}`,
    );
    for (const product of page) products.set(product.id, product);
  }
  return products;
}

export async function refreshStovesFromShop(supabase: SupabaseClient): Promise<ShopRefreshResult> {
  const config = getWooCommerceConfig();
  if (!config) throw new WooCommerceError("De webshopkoppeling is nog niet ingesteld.");

  const { data, error } = await supabase.from("stoves").select(STOVE_COLUMNS).not("shop_product_id", "is", null).order("number");
  if (error) throw error;
  const stoves = data as StoveRow[];
  const products = await fetchProducts(config, [...new Set(stoves.map((stove) => stove.shop_product_id))]);

  const result: ShopRefreshResult = { changed: [], unchanged: 0, skipped: [] };
  for (const stove of stoves) {
    // The app has a change the shop has not received yet; the shop's data would undo it.
    if (stove.shop_sync_error) {
      result.skipped.push({ number: stove.number, reason: "De webshop is nog niet bijgewerkt (⚠ in de voorraad)." });
      continue;
    }
    const product = products.get(stove.shop_product_id);
    if (!product || product.status === "trash") {
      result.skipped.push({ number: stove.number, reason: "Niet (meer) in de webshop." });
      continue;
    }

    const shopValues: Record<string, unknown> = stoveChangesFromShop(product, stove);
    // The shop's description is the stove's Marktplaats ad, which must not end up in the stove's
    // own description (the ad is generated from it).
    if (stove.marketplace_ad) delete shopValues.description;
    // Only the values that differ, so the result says what actually changed.
    const changes = Object.fromEntries(Object.entries(shopValues).filter(([column, value]) => stove[column] !== value));
    if (Object.keys(changes).length === 0) {
      result.unchanged++;
      continue;
    }

    const { error: updateError } = await supabase.from("stoves").update(changes).eq("number", stove.number);
    if (updateError) {
      console.error("Refreshing a stove from the shop failed", { stoveNumber: stove.number, code: updateError.code });
      result.skipped.push({ number: stove.number, reason: "Opslaan in de app is mislukt." });
      continue;
    }
    const fields = [...new Set(Object.keys(changes).map((column) => FIELD_LABELS[column] ?? "kenmerken"))];
    result.changed.push({ number: stove.number, fields });
  }
  return result;
}
