import type { SupabaseClient } from "@supabase/supabase-js";
import { thumbnailPath } from "./photo-thumbnails";
import { PHOTOS_BUCKET } from "./stoves";
import { WooCommerceError } from "./woocommerce/client";
import { trashShopProduct } from "./woocommerce/remove";

// Server-only. Deletes a stove with its photos, and optionally its web shop product first.

export type DeleteStoveResult = { ok: true } | { ok: false; error: string };

// Postgres error code for a violated foreign key. Invoices keep only the stove number since migration
// 20260930230000; before it is applied, a stove with invoices still cannot be deleted.
const FOREIGN_KEY_VIOLATION = "23503";
const HAS_INVOICE = "Deze kachel heeft een factuur en kan pas worden verwijderd na de database-update.";

export async function deleteStove(supabase: SupabaseClient, stoveNumber: number, { fromShop }: { fromShop: boolean }): Promise<DeleteStoveResult> {
  const [stove, photos] = await Promise.all([
    supabase.from("stoves").select("shop_product_id").eq("number", stoveNumber).maybeSingle(),
    supabase.from("stove_photos").select("path").eq("stove_number", stoveNumber),
  ]);
  if (stove.error) throw stove.error;
  if (photos.error) throw photos.error;
  if (!stove.data) return { ok: false, error: "Deze kachel bestaat niet meer." };

  if (fromShop) {
    try {
      await trashShopProduct(stove.data.shop_product_id, stoveNumber);
    } catch (error) {
      const reason = error instanceof WooCommerceError ? error.message : "De webshop gaf een fout.";
      return { ok: false, error: `Niets verwijderd: de kachel kon niet uit de webshop worden gehaald. ${reason}` };
    }
  }

  const { data: deleted, error } = await supabase.from("stoves").delete().eq("number", stoveNumber).select("number");
  if (error || deleted.length === 0) {
    if (error && error.code !== FOREIGN_KEY_VIOLATION) console.error("Deleting stove failed", { stoveNumber, code: error.code });
    const reason = error?.code === FOREIGN_KEY_VIOLATION ? HAS_INVOICE : error ? "Verwijderen uit de app is mislukt." : "Deze kachel bestaat niet meer.";
    // The shop product is in the WordPress trash by now; say so, since the stove itself remains.
    return { ok: false, error: fromShop ? `${reason} Het webshopproduct staat wel al in de prullenbak van WordPress.` : reason };
  }

  // The photo rows went with the stove; remove the files too. A failure only leaves unused files.
  const paths = photos.data.flatMap((photo) => [photo.path, thumbnailPath(photo.path)]);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(PHOTOS_BUCKET).remove(paths);
    if (removeError) console.error("Removing photos of a deleted stove failed", { stoveNumber });
  }
  return { ok: true };
}
