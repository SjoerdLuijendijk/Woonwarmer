import type { SupabaseClient } from "@supabase/supabase-js";
import { AdGenerationError } from "../marketplace-ad";
import { generateAndStoreAd } from "../marketplace-ad-store";
import { getWooCommerceConfig, WooCommerceError, wooRequest } from "./client";
import { syncStoveToShop } from "./sync";

// Server-only. TEMPORARY: a one-off reset that makes the app the single source of the web shop.
// It regenerates every ad (the prompt changed), pushes every stove, and then takes offline every
// shop product that no stove in the app owns. Remove once it has run; see docs/woocommerce-sync.md.

export type ResetStoveResult = { number: number; error: string | null };
export type ShopProductSummary = { id: number; name: string; sku: string };

// WooCommerce returns at most 100 products per page and updates at most 100 per batch request.
const PAGE_SIZE = 100;

function requireConfig() {
  const config = getWooCommerceConfig();
  if (!config) throw new WooCommerceError("De webshopkoppeling is nog niet ingesteld.");
  return config;
}

export async function listStoveNumbers(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase.from("stoves").select("number").order("number");
  if (error) throw error;
  return data.map((row) => row.number);
}

// A new ad for a stove that is still for sale (manual versions are replaced too), then the shop
// update. Sold stoves only get the shop update, which keeps their product offline.
export async function resetStove(supabase: SupabaseClient, stoveNumber: number): Promise<ResetStoveResult> {
  const { data, error } = await supabase.from("stoves").select("sold_at").eq("number", stoveNumber).maybeSingle();
  if (error) throw error;
  if (!data) return { number: stoveNumber, error: "Kachel niet gevonden." };

  let adError: string | null = null;
  if (!data.sold_at) {
    try {
      await generateAndStoreAd(supabase, stoveNumber);
    } catch (generationError) {
      if (!(generationError instanceof AdGenerationError)) throw generationError;
      adError = generationError.message;
    }
  }
  const shopError = await syncStoveToShop(supabase, stoveNumber);
  if (shopError) return { number: stoveNumber, error: `Webshop: ${shopError}` };
  return { number: stoveNumber, error: adError && `Advertentietekst: ${adError} De webshop is wel bijgewerkt.` };
}

// Published shop products that no stove in the app is linked to.
export async function findUnownedProducts(supabase: SupabaseClient): Promise<ShopProductSummary[]> {
  const config = requireConfig();
  const { data, error } = await supabase.from("stoves").select("shop_product_id").not("shop_product_id", "is", null);
  if (error) throw error;
  const owned = new Set(data.map((row) => row.shop_product_id as number));

  const unowned: ShopProductSummary[] = [];
  for (let page = 1; ; page++) {
    const products = await wooRequest<ShopProductSummary[]>(
      config,
      "GET",
      `/products?status=publish&per_page=${PAGE_SIZE}&page=${page}&orderby=id&order=asc&_fields=id,name,sku`,
    );
    unowned.push(...products.filter((product) => !owned.has(product.id)));
    if (products.length < PAGE_SIZE) break;
  }
  return unowned;
}

// Sets the given products to draft (never deletes them, so they can be put back by hand). Only
// products that are still published and unowned at this moment are touched.
export async function unpublishUnownedProducts(supabase: SupabaseClient, productIds: number[]): Promise<{ unpublished: number; failed: number }> {
  const requested = new Set(productIds);
  const ids = (await findUnownedProducts(supabase)).map((product) => product.id).filter((id) => requested.has(id));
  const config = requireConfig();

  let unpublished = 0;
  for (let start = 0; start < ids.length; start += PAGE_SIZE) {
    const update = ids.slice(start, start + PAGE_SIZE).map((id) => ({ id, status: "draft" }));
    const result = await wooRequest<{ update?: { id: number; error?: unknown }[] }>(config, "POST", "/products/batch", { update });
    unpublished += (result.update ?? []).filter((item) => !item.error).length;
  }
  return { unpublished, failed: ids.length - unpublished };
}
