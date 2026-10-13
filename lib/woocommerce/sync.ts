import type { SupabaseClient } from "@supabase/supabase-js";
import { signPhotoUrls } from "../stove-photos";
import { getStoveDetails, getStovePhotoPaths } from "../stove-queries";
import { getWooCommerceConfig, WooCommerceError, wooRequest } from "./client";
import { buildShopProduct, STOVE_NUMBER_META_KEY, type ShopImage, type ShopPhoto } from "./product";
import { ShopTaxonomy } from "./taxonomy";

// Server-only. Pushes one stove to the WooCommerce shop with the caller's (team member's) client.

type ShopProduct = { id: number; status: string; images: ShopImage[]; meta_data?: { key: string; value: unknown }[] };
type Config = NonNullable<ReturnType<typeof getWooCommerceConfig>>;

const NOT_CONFIGURED = "De webshopkoppeling is nog niet ingesteld.";
const UNKNOWN_ERROR = "Het bijwerken van de webshop is mislukt. Probeer het opnieuw.";
// WooCommerce's error code when the SKU is already used by another product.
const DUPLICATE_SKU = "product_invalid_sku";

export async function findProduct(config: Config, productId: number | null, sku: string): Promise<ShopProduct | null> {
  if (productId) {
    try {
      const product = await wooRequest<ShopProduct>(config, "GET", `/products/${productId}`);
      // A product moved to the trash in WordPress counts as deleted; updating it would restore it.
      if (product.status !== "trash") return product;
    } catch (error) {
      // Deleted in WordPress: fall back to the SKU, and otherwise create it again.
      if (!(error instanceof WooCommerceError && error.status === 404)) throw error;
    }
  }
  const matches = await wooRequest<ShopProduct[]>(config, "GET", `/products?sku=${encodeURIComponent(sku)}`);
  const match = matches.find((product) => product.status !== "trash");
  if (!match) return null;
  // Found by SKU only: it must be a product the app made for this stove, not another shop product.
  // Six-digit numbers were only ever handed out by the app, before products carried the marker.
  const madeByApp = sku.length === 6 || match.meta_data?.some(({ key, value }) => key === STOVE_NUMBER_META_KEY && String(value) === sku);
  if (!madeByApp) {
    throw new WooCommerceError(`Nummer ${sku} is in de webshop al in gebruik door een ander product.`, undefined, "sku_taken");
  }
  return match;
}

async function signedPhotos(supabase: SupabaseClient, stoveNumber: number): Promise<ShopPhoto[]> {
  const photos = await getStovePhotoPaths(supabase, stoveNumber);
  const urlByPath = await signPhotoUrls(supabase, photos.map((photo) => photo.path));
  return photos.flatMap((photo) => {
    const url = urlByPath.get(photo.path);
    return url ? [{ id: photo.id, url }] : [];
  });
}

async function recordOutcome(supabase: SupabaseClient, stoveNumber: number, values: { shop_product_id?: number | null; shop_sync_error: string | null }) {
  const { error } = await supabase
    .from("stoves")
    .update({ ...values, ...(values.shop_sync_error ? {} : { shop_synced_at: new Date().toISOString() }) })
    .eq("number", stoveNumber);
  if (error) console.error("Recording web shop sync failed", { code: error.code });
}

async function pushStove(supabase: SupabaseClient, config: Config, stoveNumber: number) {
  const [stove, stored] = await Promise.all([
    getStoveDetails(supabase, stoveNumber),
    supabase.from("stoves").select("shop_product_id, shop_sync_error, marketplace_ad").eq("number", stoveNumber).maybeSingle(),
  ]);
  if (stored.error) throw stored.error;
  if (!stove || !stored.data) return;

  // Never pushed to the shop and not listed: the shop has nothing to update.
  if (!stored.data.shop_product_id && !stove.shopListed) {
    if (stored.data.shop_sync_error) await recordOutcome(supabase, stoveNumber, { shop_sync_error: null });
    return;
  }

  const sku = String(stove.number);
  let product = await findProduct(config, stored.data.shop_product_id, sku);
  // Removed from the shop by hand while unlisted: leave it removed.
  if (!product && !stove.shopListed) {
    await recordOutcome(supabase, stoveNumber, { shop_product_id: null, shop_sync_error: null });
    return;
  }

  const photos = await signedPhotos(supabase, stoveNumber);
  const payload = await buildShopProduct(stove, stored.data.marketplace_ad, photos, product?.images ?? [], new ShopTaxonomy(config));

  if (!product) {
    try {
      product = await wooRequest<ShopProduct>(config, "POST", "/products", payload);
    } catch (error) {
      // A parallel sync created it first: update that product instead.
      if (!(error instanceof WooCommerceError && error.code === DUPLICATE_SKU)) throw error;
      const existing = await findProduct(config, null, sku);
      if (!existing) throw error;
      product = await wooRequest<ShopProduct>(config, "PUT", `/products/${existing.id}`, await buildShopProduct(stove, stored.data.marketplace_ad, photos, existing.images, new ShopTaxonomy(config)));
    }
  } else {
    product = await wooRequest<ShopProduct>(config, "PUT", `/products/${product.id}`, payload);
  }

  await recordOutcome(supabase, stoveNumber, { shop_product_id: product.id, shop_sync_error: null });
}

// Brings the stove's web shop product in line with the app. Never throws: the outcome is stored on
// the stove (shop_sync_error) and returned, so saving in the app never fails because of the shop.
export async function syncStoveToShop(supabase: SupabaseClient, stoveNumber: number): Promise<string | null> {
  // Imported stoves stay out of the shop sync until they are linked explicitly.
  const { data: link, error: linkError } = await supabase.from("stoves").select("shop_sync_enabled").eq("number", stoveNumber).maybeSingle();
  if (linkError) {
    console.error("Web shop sync failed", { stoveNumber, code: linkError.code });
    return UNKNOWN_ERROR;
  }
  if (!link?.shop_sync_enabled) return null;

  const config = getWooCommerceConfig();
  if (!config) {
    const { data } = await supabase.from("stoves").select("shop_listed, shop_sync_error").eq("number", stoveNumber).maybeSingle();
    if (data?.shop_listed) {
      await recordOutcome(supabase, stoveNumber, { shop_sync_error: NOT_CONFIGURED });
      return NOT_CONFIGURED;
    }
    if (data?.shop_sync_error) await recordOutcome(supabase, stoveNumber, { shop_sync_error: null });
    return null;
  }

  try {
    await pushStove(supabase, config, stoveNumber);
    return null;
  } catch (error) {
    const message = error instanceof WooCommerceError ? error.message : UNKNOWN_ERROR;
    // Status and code only; request and response bodies are not logged.
    console.error("Web shop sync failed", {
      stoveNumber,
      status: error instanceof WooCommerceError ? error.status : undefined,
      code: error instanceof WooCommerceError ? error.code : (error as { code?: unknown })?.code,
    });
    await recordOutcome(supabase, stoveNumber, { shop_sync_error: message });
    return message;
  }
}
