import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { HAVE_MEDIA_URL, HAVE_SUPPLIER, isHaveImagePath, type CatalogProduct } from "./have-catalog";
import { storePhotos } from "./stove-photos";

// Server-only. Stores one product of the supplier's catalogue as a made-to-order stove, with the
// caller's (team member's) client so RLS and the column grants apply. See docs/supplier-catalog.md.

const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 50_000_000;
const PHOTO_EDGE_PX = 1600;
const PHOTO_QUALITY = 82;
// Postgres error code for a violated unique constraint.
const UNIQUE_VIOLATION = "23505";

export type CatalogImportResult = { status: "created" | "updated"; number: number; failedPhotos: number };

export class CatalogImportError extends Error {}

// Downloads one photo from the supplier's media host and turns it into a JPEG like the app's own
// photos. sharp only accepts real images, so whatever else the host might return is rejected.
async function downloadPhoto(path: string) {
  if (!isHaveImagePath(path)) throw new Error("Unexpected image path");
  const response = await fetch(`${HAVE_MEDIA_URL}${path}`, { redirect: "error", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Photo download failed with status ${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES) throw new Error("Photo too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error("Photo too large");

  const jpeg = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: PHOTO_EDGE_PX, height: PHOTO_EDGE_PX, fit: "inside", withoutEnlargement: true })
    // Transparent PNGs get a white background instead of a black one.
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: PHOTO_QUALITY, mozjpeg: true })
    .toBuffer();
  return new Uint8Array(jpeg);
}

// Returns how many photos could not be added. Photos keep the supplier's order.
async function addPhotos(supabase: SupabaseClient, stoveNumber: number, paths: string[]) {
  const downloads = await Promise.allSettled(paths.map(downloadPhoto));
  const photos = downloads.flatMap((download) => (download.status === "fulfilled" ? [download.value] : []));
  if (photos.length > 0) await storePhotos(supabase, stoveNumber, photos);
  return paths.length - photos.length;
}

async function photoCount(supabase: SupabaseClient, stoveNumber: number) {
  const { count, error } = await supabase.from("stove_photos").select("id", { count: "exact", head: true }).eq("stove_number", stoveNumber);
  if (error) throw error;
  return count ?? 0;
}

// A product imported before is updated (price, name, details and description); its photos, web
// shop choice and supply stay as they are. Photos are only added when it has none yet, so an
// interrupted import can simply be run again.
export async function importCatalogProduct(supabase: SupabaseClient, product: CatalogProduct, listInShop: boolean): Promise<CatalogImportResult> {
  const { data: existing, error: findError } = await supabase
    .from("stoves")
    .select("number")
    .eq("supplier", HAVE_SUPPLIER)
    .eq("supplier_sku", product.sku)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase.from("stoves").update(product.values).eq("number", existing.number);
    if (error) throw error;
    const failedPhotos = (await photoCount(supabase, existing.number)) === 0 ? await addPhotos(supabase, existing.number, product.imagePaths) : 0;
    return { status: "updated", number: existing.number, failedPhotos };
  }

  const { data: created, error } = await supabase
    .from("stoves")
    .insert({
      ...product.values,
      condition: "new",
      made_to_order: true,
      stock_quantity: 1,
      shop_listed: listInShop,
      supplier: HAVE_SUPPLIER,
      supplier_sku: product.sku,
    })
    .select("number")
    .single();
  if (error?.code === UNIQUE_VIOLATION) throw new CatalogImportError("Wordt al tegelijk geïmporteerd. Probeer het opnieuw.");
  if (error) throw error;

  return { status: "created", number: created.number, failedPhotos: await addPhotos(supabase, created.number, product.imagePaths) };
}
