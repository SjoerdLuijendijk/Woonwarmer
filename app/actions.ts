"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireTeamMember } from "../lib/auth";
import { refreshStoredAd } from "../lib/marketplace-ad-store";
import { deleteStove } from "../lib/stove-delete";
import { parseStockQuantity, parseStoveFields } from "../lib/stove-fields";
import { LISTING_CHANNELS, PHOTOS_BUCKET, type ListingChannel } from "../lib/stoves";
import { readPhotos, storePhotos, UserError } from "../lib/stove-photos";
import { linkStove } from "../lib/woocommerce/link";
import { syncStoveToShop } from "../lib/woocommerce/sync";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de voorraad." } as const;
// Postgres error code for a violated check constraint.
const CHECK_VIOLATION = "23514";

function errorMessage(error: unknown) {
  // Database and storage details are not shown to the user.
  return error instanceof UserError ? error.message : "Er ging iets mis. Probeer het opnieuw.";
}

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

// Updates the web shop product after the response, so saving never waits for the shop. The outcome
// is stored on the stove and shown in the inventory.
function syncShopLater(supabase: Parameters<typeof syncStoveToShop>[0], stoveNumber: number) {
  after(() => syncStoveToShop(supabase, stoveNumber));
}

// Prepares the Marktplaats ad after the response, so saving never waits for it. The ad is the web
// shop's product description, so the product is updated again once a new ad is stored.
function refreshAdLater(supabase: Parameters<typeof syncStoveToShop>[0], stoveNumber: number) {
  after(async () => {
    if (await refreshStoredAd(supabase, stoveNumber)) await syncStoveToShop(supabase, stoveNumber);
  });
}

export async function addStove(formData: FormData): Promise<ActionResult<{ number: number; warning?: string }>> {
  const fields = parseStoveFields(formData);
  if (!fields.ok) return fields;
  const quantity = parseStockQuantity(formData, fields.values);
  if (!quantity.ok) return quantity;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  let photos: Uint8Array[];
  try {
    photos = await readPhotos(formData);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  const { data: stove, error } = await supabase
    .from("stoves")
    .insert({ ...fields.values, stock_quantity: quantity.value })
    .select("number")
    .single();
  if (error) return { ok: false, error: errorMessage(error) };

  refreshAdLater(supabase, stove.number);
  // Registered after storing the photos below, since after() runs once the response is sent.
  syncShopLater(supabase, stove.number);
  revalidatePath("/");
  try {
    await storePhotos(supabase, stove.number, photos);
  } catch {
    return { ok: true, number: stove.number, warning: "Niet alle foto's zijn opgeslagen. Voeg ze toe via de voorraad." };
  }

  return { ok: true, number: stove.number };
}

export async function updateStove(stoveNumber: number, formData: FormData): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };
  const fields = parseStoveFields(formData);
  if (!fields.ok) return fields;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase.from("stoves").update(fields.values).eq("number", stoveNumber).select("number");
  if (error?.code === CHECK_VIOLATION) {
    return { ok: false, error: "Deze kachel heeft meer dan 1 op voorraad en kan daarom niet op gereviseerd worden gezet." };
  }
  if (error) return { ok: false, error: errorMessage(error) };
  if (data.length === 0) return { ok: false, error: "Deze kachel bestaat niet meer." };

  // The stored ad would otherwise show outdated details such as the old price.
  refreshAdLater(supabase, stoveNumber);
  syncShopLater(supabase, stoveNumber);
  revalidatePath("/");
  return { ok: true };
}

export async function addStovePhotos(stoveNumber: number, formData: FormData): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  try {
    await storePhotos(supabase, stoveNumber, await readPhotos(formData));
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  } finally {
    revalidatePath("/");
    syncShopLater(supabase, stoveNumber);
  }
  return { ok: true };
}

// Sells (-1) or restocks (+1) one unit; the stove counts as sold once its stock reaches 0.
export async function adjustStoveStock(stoveNumber: number, delta: -1 | 1): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber) || (delta !== -1 && delta !== 1)) return { ok: false, error: "Onbekende kachel." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase.rpc("adjust_stove_stock", { p_stove_number: stoveNumber, p_delta: delta });
  if (error?.code === CHECK_VIOLATION) {
    return {
      ok: false,
      error: delta === -1 ? "Deze kachel is al uitverkocht." : "Een gereviseerde kachel kan maar 1 keer op voorraad staan.",
    };
  }
  if (error) return { ok: false, error: errorMessage(error) };
  // Null: the stove no longer exists, or it is made to order and keeps no stock.
  if (data === null) return { ok: false, error: "De voorraad van deze kachel kan niet worden aangepast." };

  syncShopLater(supabase, stoveNumber);
  revalidatePath("/");
  return { ok: true };
}

// Keeps a new stove available once its last unit is sold: from now on it is ordered from the supplier.
// The database trigger then sets the stock to 1 and clears the sold date.
export async function makeStoveMadeToOrder(stoveNumber: number): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase
    .from("stoves")
    .update({ made_to_order: true })
    .eq("number", stoveNumber)
    .eq("condition", "new")
    .select("number");
  if (error) return { ok: false, error: errorMessage(error) };
  if (data.length === 0) return { ok: false, error: "Alleen een nieuwe kachel kan op bestelling leverbaar worden." };

  // The stored ad mentions the availability.
  refreshAdLater(supabase, stoveNumber);
  syncShopLater(supabase, stoveNumber);
  revalidatePath("/");
  return { ok: true };
}

export async function setStoveListed(stoveNumber: number, channel: ListingChannel, listed: boolean): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber) || !Object.hasOwn(LISTING_CHANNELS, channel) || typeof listed !== "boolean") {
    return { ok: false, error: "Onbekende kachel." };
  }

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase
    .from("stoves")
    .update({ [LISTING_CHANNELS[channel].column]: listed })
    .eq("number", stoveNumber)
    .select("stock_quantity");
  if (error) return { ok: false, error: errorMessage(error) };
  if (data.length === 0) return { ok: false, error: "Deze kachel bestaat niet meer." };
  if (channel === "shop") syncShopLater(supabase, stoveNumber);
  // The database keeps sold-out stoves unlisted, so the tick did not stick.
  if (listed && data[0].stock_quantity === 0) {
    revalidatePath("/");
    return { ok: false, error: "Een verkochte kachel kan niet worden aangeboden." };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function deleteStovePhoto(photoId: number): Promise<ActionResult> {
  if (!isPositiveId(photoId)) return { ok: false, error: "Onbekende foto." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data: photo, error } = await supabase.from("stove_photos").select("path, stove_number").eq("id", photoId).single();
  if (error) return { ok: false, error: errorMessage(error) };

  const { error: removeError } = await supabase.storage.from(PHOTOS_BUCKET).remove([photo.path]);
  if (removeError) return { ok: false, error: errorMessage(removeError) };

  const { error: deleteError } = await supabase.from("stove_photos").delete().eq("id", photoId);
  if (deleteError) return { ok: false, error: errorMessage(deleteError) };

  syncShopLater(supabase, photo.stove_number);
  revalidatePath("/");
  return { ok: true };
}

// Deletes a stove with its photos. With fromShop, its web shop product is moved to the WordPress
// trash first; if that fails, nothing is deleted. Stoves with invoices cannot be deleted.
export async function deleteStoveAction(stoveNumber: number, fromShop: boolean): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber) || typeof fromShop !== "boolean") return { ok: false, error: "Onbekende kachel." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  try {
    const result = await deleteStove(supabase, stoveNumber, { fromShop });
    revalidatePath("/");
    return result;
  } catch (error) {
    console.error("Deleting stove failed", { stoveNumber, code: (error as { code?: unknown })?.code });
    return { ok: false, error: errorMessage(error) };
  }
}

// Links an imported stove to its web shop product and updates the product right away. From then on
// the app keeps the product up to date, like for stoves added in the app.
export async function linkStoveToShop(stoveNumber: number): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  let result;
  try {
    result = await linkStove(supabase, stoveNumber);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  revalidatePath("/");
  if (result.ok) return { ok: true };
  return { ok: false, error: result.notFound ? result.error : `Gekoppeld, maar de webshop is niet bijgewerkt: ${result.error}` };
}

// Retries the web shop update right away, for example after the shop was unreachable.
export async function retryShopSync(stoveNumber: number): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const error = await syncStoveToShop(supabase, stoveNumber);
  revalidatePath("/");
  return error ? { ok: false, error } : { ok: true };
}
