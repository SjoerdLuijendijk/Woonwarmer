import { CONDITION_LABELS, stoveTypeLabel, type StoveDetails } from "../stoves";
import { stoveProductName, stoveSpecs, type StoveSpecKey } from "../stove-specs";
import type { ShopTaxonomy } from "./taxonomy";

// Server-only. Builds the WooCommerce product for a stove; see docs/woocommerce-sync.md.

export type ShopImage = { id: number; name: string };
export type ShopPhoto = { id: number; url: string };

type ProductAttribute = { id?: number; name?: string; options: string[]; visible: boolean; variation: false; position: number };

const DECIMAL = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const FLUE_TERMS = { top: ["Bovenaansluiting"], rear: ["Achteraansluiting"], both: ["Bovenaansluiting", "Achteraansluiting"] } as const;
// Details that go into the shop's global (filterable) attributes instead of a product-specific one.
const GLOBAL_SPEC_KEYS: StoveSpecKey[] = ["condition", "stoveType", "power", "flueOutlet"];

// Marks products made or taken over by the app with their stove number, so a product that only
// shares the SKU (made in WordPress under a number the app handed out as well) is never overwritten.
export const STOVE_NUMBER_META_KEY = "woonwarmer_stove_number";
// GoedGeplaatst only forwards products with stock to Marktplaats, so made-to-order stoves show one.
const MADE_TO_ORDER_SHOP_STOCK = 1;

// Photos keep this name in the shop, so a later sync reuses them instead of uploading them again.
export function shopImageName(stoveNumber: number, photoId: number) {
  return `kachel-${stoveNumber}-foto-${photoId}`;
}

function categorySlugs(stove: StoveDetails) {
  if (stove.condition === "new") return ["nieuwe-kachels"];
  if (stove.condition !== "used") return [];
  const subcategory = stove.stoveType === "soapstone" ? "speksteenkachels" : stove.stoveType === "wood" ? "houtkachels" : null;
  return ["gereviseerde-kachels", ...(subcategory ? [subcategory] : [])];
}

async function globalAttributes(stove: StoveDetails, taxonomy: ShopTaxonomy) {
  const typeLabel = stoveTypeLabel(stove.stoveType);
  const wanted: [string, string[]][] = [
    ["pa_merk", [stove.brand]],
    ["pa_staat", stove.condition ? [CONDITION_LABELS[stove.condition]] : []],
    ["pa_type-kachel", typeLabel ? [typeLabel] : []],
    ["pa_aansluiting", stove.flueOutlet ? [...FLUE_TERMS[stove.flueOutlet]] : []],
    ["pa_vermogen", stove.powerKw === null ? [] : [`${DECIMAL.format(stove.powerKw)} kW`]],
  ];

  const attributes: Omit<ProductAttribute, "position">[] = [];
  // One at a time: resolving a term may create it, and parallel requests could create it twice.
  for (const [slug, names] of wanted) {
    if (names.length === 0) continue;
    const id = await taxonomy.attributeId(slug);
    if (id === null) continue;
    const options: string[] = [];
    for (const name of names) options.push(await taxonomy.termName(id, name));
    attributes.push({ id, options, visible: true, variation: false });
  }
  return attributes;
}

// adText: the stove's Marktplaats ad. It becomes the product description, which the GoedGeplaatst
// connector in the shop forwards to Marktplaats; without it the stove's own description is used.
export async function buildShopProduct(stove: StoveDetails, adText: string | null, photos: ShopPhoto[], existingImages: ShopImage[], taxonomy: ShopTaxonomy) {
  const categoryIds: number[] = [];
  for (const slug of categorySlugs(stove)) {
    const id = await taxonomy.categoryId(slug);
    if (id !== null) categoryIds.push(id);
  }

  const customAttributes = stoveSpecs(stove)
    .filter(({ key }) => !GLOBAL_SPEC_KEYS.includes(key))
    .map(({ label, value }) => ({ name: label, options: [value], visible: true, variation: false as const }));
  const attributes = [...(await globalAttributes(stove, taxonomy)), ...customAttributes].map((attribute, position) => ({ ...attribute, position }));

  const imageIdByName = new Map(existingImages.map((image) => [image.name, image.id]));
  const images = photos.map((photo) => {
    const name = shopImageName(stove.number, photo.id);
    const id = imageIdByName.get(name);
    return id ? { id } : { src: photo.url, name };
  });

  const inStock = stove.stockQuantity > 0;
  return {
    name: stoveProductName(stove),
    type: "simple",
    // The database unticks sold-out stoves, so a listed stove is always available.
    status: stove.shopListed ? "publish" : "draft",
    sku: String(stove.number),
    meta_data: [{ key: STOVE_NUMBER_META_KEY, value: String(stove.number) }],
    regular_price: stove.priceCents ? (stove.priceCents / 100).toFixed(2) : "",
    description: adText || stove.description || "",
    categories: categoryIds.map((id) => ({ id })),
    attributes,
    images,
    // Made to order: backorders are allowed, so a shop order makes it a backorder until the next sync.
    ...(stove.madeToOrder
      ? { manage_stock: true, stock_quantity: MADE_TO_ORDER_SHOP_STOCK, stock_status: "instock", backorders: "notify" }
      : { manage_stock: true, stock_quantity: stove.stockQuantity, stock_status: inStock ? "instock" : "outofstock", backorders: "no" }),
  };
}
