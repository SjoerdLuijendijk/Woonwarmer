"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "../lib/auth";
import { RESET_BATCH_SIZE } from "../lib/shop-reset-batch";
import { WooCommerceError } from "../lib/woocommerce/client";
import {
  findUnownedProducts,
  listStoveNumbers,
  resetStove,
  unpublishUnownedProducts,
  type ResetStoveResult,
  type ShopProductSummary,
} from "../lib/woocommerce/shop-reset";

// TEMPORARY: actions behind the one-off web shop reset in Admin → Webshop (lib/woocommerce/shop-reset.ts).

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de voorraad." } as const;
const MAX_PRODUCT_IDS = 2000;

function failure(error: unknown, context: string, fallback: string) {
  if (error instanceof WooCommerceError) return { ok: false as const, error: error.message };
  console.error(context, { code: (error as { code?: unknown })?.code });
  return { ok: false as const, error: fallback };
}

export async function getResetStoveNumbers(): Promise<Result<{ numbers: number[] }>> {
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  try {
    return { ok: true, numbers: await listStoveNumbers(supabase) };
  } catch (error) {
    return failure(error, "Listing stoves for the shop reset failed", "De kachels konden niet worden opgehaald. Probeer het opnieuw.");
  }
}

export async function resetStoveBatch(numbers: unknown): Promise<Result<{ results: ResetStoveResult[] }>> {
  if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > RESET_BATCH_SIZE || !numbers.every((n) => Number.isSafeInteger(n) && n > 0)) {
    return { ok: false, error: "Onbekende kachels." };
  }
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  try {
    const results = await Promise.all((numbers as number[]).map((number) => resetStove(supabase, number)));
    revalidatePath("/");
    return { ok: true, results };
  } catch (error) {
    return failure(error, "Shop reset batch failed", "Er ging iets mis. Probeer het opnieuw.");
  }
}

export async function listUnownedShopProducts(): Promise<Result<{ products: ShopProductSummary[] }>> {
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  try {
    return { ok: true, products: await findUnownedProducts(supabase) };
  } catch (error) {
    return failure(error, "Listing unowned shop products failed", "De webshop kon niet worden gecontroleerd. Probeer het opnieuw.");
  }
}

export async function unpublishUnownedShopProducts(productIds: unknown): Promise<Result<{ unpublished: number; failed: number }>> {
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > MAX_PRODUCT_IDS || !productIds.every((id) => Number.isSafeInteger(id) && id > 0)) {
    return { ok: false, error: "Onbekende producten." };
  }
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  try {
    return { ok: true, ...(await unpublishUnownedProducts(supabase, productIds as number[])) };
  } catch (error) {
    return failure(error, "Unpublishing unowned shop products failed", "Het offline halen is mislukt. Probeer het opnieuw.");
  }
}
