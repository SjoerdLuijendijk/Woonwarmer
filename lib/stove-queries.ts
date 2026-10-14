import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenNotesByStove } from "./stove-note-queries";
import { thumbnailPath } from "./photo-thumbnails";
import { signPhotoUrls } from "./stove-photos";
import type { Stove, StoveDetails, StoveInvoice, StovePhoto } from "./stoves";

const DETAIL_COLUMNS =
  "number, brand, shop_name, condition, height_cm, width_cm, depth_cm, flue_outlet, flue_diameter_mm, price_cents, stove_type, power_kw, min_power_kw, max_power_kw, weight_kg, flue_center_height_cm, external_air_supply, new_firebox, thermostat, efficiency_percent, energy_label, warranty_years, material, description, shop_listed, shop_sync_error, shop_product_id, made_to_order, stock_quantity, sold_at, created_at";

type DetailsRow = {
  number: number;
  brand: string;
  shop_name: string | null;
  condition: StoveDetails["condition"];
  height_cm: number | null;
  width_cm: number | null;
  depth_cm: number | null;
  flue_outlet: StoveDetails["flueOutlet"];
  flue_diameter_mm: number | null;
  price_cents: number | null;
  stove_type: StoveDetails["stoveType"];
  power_kw: number | null;
  min_power_kw: number | null;
  max_power_kw: number | null;
  weight_kg: number | null;
  flue_center_height_cm: number | null;
  external_air_supply: boolean | null;
  new_firebox: boolean | null;
  thermostat: boolean | null;
  efficiency_percent: number | null;
  energy_label: StoveDetails["energyLabel"];
  warranty_years: number | null;
  material: string | null;
  description: string | null;
  shop_listed: boolean;
  shop_sync_error: string | null;
  shop_product_id: number | null;
  made_to_order: boolean;
  stock_quantity: number;
  sold_at: string | null;
  created_at: string;
};

function toStoveDetails(row: DetailsRow): StoveDetails {
  return {
    number: row.number,
    brand: row.brand,
    shopName: row.shop_name,
    condition: row.condition,
    heightCm: row.height_cm,
    widthCm: row.width_cm,
    depthCm: row.depth_cm,
    flueOutlet: row.flue_outlet,
    flueDiameterMm: row.flue_diameter_mm,
    priceCents: row.price_cents,
    stoveType: row.stove_type,
    powerKw: row.power_kw,
    minPowerKw: row.min_power_kw,
    maxPowerKw: row.max_power_kw,
    weightKg: row.weight_kg,
    flueCenterHeightCm: row.flue_center_height_cm,
    externalAirSupply: row.external_air_supply,
    newFirebox: row.new_firebox,
    thermostat: row.thermostat,
    efficiencyPercent: row.efficiency_percent,
    energyLabel: row.energy_label,
    warrantyYears: row.warranty_years,
    material: row.material,
    description: row.description,
    shopListed: row.shop_listed,
    shopSyncError: row.shop_sync_error,
    shopProductId: row.shop_product_id,
    madeToOrder: row.made_to_order,
    stockQuantity: row.stock_quantity,
    soldAt: row.sold_at,
    createdAt: row.created_at,
  };
}

export async function getStoves(supabase: SupabaseClient): Promise<Stove[]> {
  // Invoices are fetched separately: they only record the stove number, so they outlive a deleted stove.
  const [stoves, invoices, notesByStove] = await Promise.all([
    supabase
      .from("stoves")
      .select(`${DETAIL_COLUMNS}, stove_photos (id, path)`)
      .order("number", { ascending: false })
      .order("id", { referencedTable: "stove_photos", ascending: true }),
    supabase.from("invoices").select("id, invoice_number, stove_number").order("id", { ascending: true }),
    getOpenNotesByStove(supabase),
  ]);
  if (stoves.error) throw stoves.error;
  if (invoices.error) throw invoices.error;

  const invoicesByStove = new Map<number, StoveInvoice[]>();
  for (const invoice of invoices.data) {
    if (invoice.stove_number === null) continue;
    const list = invoicesByStove.get(invoice.stove_number) ?? [];
    list.push({ id: invoice.id, number: invoice.invoice_number });
    invoicesByStove.set(invoice.stove_number, list);
  }

  // Only the main photos are signed here, to keep the page fast with a large stock; getStovePhotos
  // signs all photos of one stove when they are opened.
  const mainPhotos = stoves.data.flatMap((stove) => stove.stove_photos.slice(0, 1));
  const signed = await signPhotos(supabase, mainPhotos);

  return stoves.data.map((stove) => ({
    ...toStoveDetails(stove as DetailsRow),
    invoices: invoicesByStove.get(stove.number) ?? [],
    notes: notesByStove.get(stove.number) ?? [],
    mainPhoto: stove.stove_photos[0] ? signed.get(stove.stove_photos[0].id) ?? null : null,
    photoCount: stove.stove_photos.length,
  }));
}

// All photos of one stove, in upload order.
export async function getStovePhotos(supabase: SupabaseClient, number: number): Promise<StovePhoto[]> {
  const photos = await getStovePhotoPaths(supabase, number);
  const signed = await signPhotos(supabase, photos);
  return photos.map((photo) => signed.get(photo.id)!);
}

async function signPhotos(supabase: SupabaseClient, photos: { id: number; path: string }[]) {
  const paths = photos.map((photo) => photo.path);
  const [urlByPath, thumbUrlByPath] = await Promise.all([
    signPhotoUrls(supabase, paths),
    // Thumbnails are optional: without them the full photos are shown.
    signPhotoUrls(supabase, paths.map(thumbnailPath)).catch(() => new Map<string, string>()),
  ]);
  return new Map<number, StovePhoto>(
    photos.map((photo) => [
      photo.id,
      { id: photo.id, url: urlByPath.get(photo.path) ?? null, thumbUrl: thumbUrlByPath.get(thumbnailPath(photo.path)) ?? null },
    ]),
  );
}

// Null: the stove does not exist (or is not visible to the caller).
export async function getStoveDetails(supabase: SupabaseClient, number: number): Promise<StoveDetails | null> {
  const { data, error } = await supabase.from("stoves").select(DETAIL_COLUMNS).eq("number", number).maybeSingle();
  if (error) throw error;
  return data ? toStoveDetails(data as DetailsRow) : null;
}

// Photo ids and storage paths in upload order.
export async function getStovePhotoPaths(supabase: SupabaseClient, number: number): Promise<{ id: number; path: string }[]> {
  const { data, error } = await supabase.from("stove_photos").select("id, path").eq("stove_number", number).order("id");
  if (error) throw error;
  return data;
}

export async function getKnownBrands(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("stoves").select("brand").limit(1000);
  if (error) throw error;
  return [...new Set(data.map((row) => row.brand))].sort((a, b) => a.localeCompare(b, "nl"));
}
