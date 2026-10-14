import { getWooCommerceConfig, WooCommerceError, wooRequest } from "./client";
import { MADE_TO_ORDER_STOCK_FIELDS, STOVE_NUMBER_META_KEY } from "./product";

// Server-only. Puts sold made-to-order stoves back in stock in the web shop, so GoedGeplaatst keeps
// forwarding them to Marktplaats. Only the stock fields change; details and photos are left alone.
//
// Only made-to-order products allow backorders, so a published app product "on backorder" is a
// made-to-order stove that is listed in the app (unlisted stoves are drafts) and was ordered, or one
// sent before made-to-order stoves had stock. Stoves the shop really holds never get this status.

// Products per round; WooCommerce accepts up to 100 per batch, fewer keeps requests short.
const ROUND_SIZE = 25;

type ListedProduct = { id: number; sku: string; meta_data?: { key: string; value: unknown }[] };
type BatchResponse = { update?: { id: number; error?: { code?: string } }[] };

export type RestockFailure = { sku: string; message: string };
export type RestockResult = { updated: number; failed: RestockFailure[]; finished: boolean };

function failureMessage(code: string | undefined) {
  return `De webshop weigerde de wijziging${code ? ` (${code})` : ""}.`;
}

// Works in rounds until no such product is left or `deadline` (epoch ms) has passed; `finished` is
// false in the latter case, and a next call continues. Throws a WooCommerceError when the shop fails.
export async function restockMadeToOrderProducts(deadline: number): Promise<RestockResult> {
  const config = getWooCommerceConfig();
  if (!config) throw new WooCommerceError("De webshopkoppeling is nog niet ingesteld.");

  const result: RestockResult = { updated: 0, failed: [], finished: false };
  // Products that stay on backorder (not the app's, or refused), so the next round skips them.
  const skipped: number[] = [];

  while (Date.now() < deadline) {
    const query = new URLSearchParams({
      status: "publish",
      stock_status: "onbackorder",
      per_page: String(ROUND_SIZE),
      _fields: "id,sku,meta_data",
    });
    if (skipped.length > 0) query.set("exclude", skipped.join(","));
    const products = await wooRequest<ListedProduct[]>(config, "GET", `/products?${query}`);
    if (products.length === 0) {
      result.finished = true;
      break;
    }

    const own = products.filter((product) => product.meta_data?.some(({ key }) => key === STOVE_NUMBER_META_KEY));
    skipped.push(...products.filter((product) => !own.includes(product)).map((product) => product.id));
    if (own.length === 0) continue;

    const response = await wooRequest<BatchResponse>(config, "POST", "/products/batch", {
      update: own.map((product) => ({ id: product.id, ...MADE_TO_ORDER_STOCK_FIELDS })),
    });
    const errorById = new Map((response.update ?? []).map((item) => [item.id, item.error]));
    for (const product of own) {
      const error = errorById.get(product.id);
      if (errorById.has(product.id) && !error) {
        result.updated++;
      } else {
        skipped.push(product.id);
        result.failed.push({ sku: product.sku, message: failureMessage(error?.code) });
      }
    }
  }
  return result;
}
