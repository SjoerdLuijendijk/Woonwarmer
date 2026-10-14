"use server";

import { revalidatePath } from "next/cache";
import { requireTeamMember } from "../lib/auth";
import { CatalogImportError, importCatalogProduct } from "../lib/catalog-import";
import { HAVE_COLUMNS, parseHaveProduct, type HaveRecord } from "../lib/have-catalog";
import { WooCommerceError } from "../lib/woocommerce/client";
import { restockMadeToOrderProducts, type RestockResult } from "../lib/woocommerce/stock";
import { syncStoveToShop } from "../lib/woocommerce/sync";
import type { ActionResult } from "./actions";

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de voorraad." } as const;
// Longer than any value in the export (descriptions stay below 5,000 characters).
const MAX_VALUE_LENGTH = 20_000;

export type CatalogImportOutcome = {
  status: "created" | "updated";
  number: number;
  /** Something that did not work out, while the stove itself was saved. */
  warning?: string;
};

// Keeps only the known columns, as strings of a sane length.
function readRecord(value: unknown): HaveRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: HaveRecord = {};
  for (const column of HAVE_COLUMNS) {
    const field = (value as Record<string, unknown>)[column];
    if (field === undefined) continue;
    if (typeof field !== "string" || field.length > MAX_VALUE_LENGTH) return null;
    record[column] = field;
  }
  return record;
}

// Imports one catalogue product (Admin → Catalogus importeren) and then brings its web shop product
// up to date. The browser calls it once per product, so every call stays short.
export async function importCatalogProductAction(value: unknown, listInShop: unknown): Promise<ActionResult<{ outcome: CatalogImportOutcome }>> {
  const record = readRecord(value);
  if (!record || typeof listInShop !== "boolean") return { ok: false, error: "Ongeldig product." };
  const parsed = parseHaveProduct(record);
  if (!parsed.ok) return parsed;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  let result;
  try {
    result = await importCatalogProduct(supabase, parsed.product, listInShop);
  } catch (error) {
    if (error instanceof CatalogImportError) return { ok: false, error: error.message };
    // Codes only; the product data is not logged.
    console.error("Catalogue import failed", { code: (error as { code?: unknown })?.code });
    return { ok: false, error: "Opslaan is mislukt. Probeer het opnieuw." };
  }
  revalidatePath("/");

  // Awaited instead of after(): the browser waits for it, so the shop gets one product at a time.
  const shopError = await syncStoveToShop(supabase, result.number);
  const warnings = [
    result.failedPhotos > 0 && `${result.failedPhotos} foto('s) konden niet worden opgehaald`,
    shopError && `webshop: ${shopError}`,
  ].filter(Boolean);
  return {
    ok: true,
    outcome: { status: result.status, number: result.number, ...(warnings.length > 0 ? { warning: warnings.join("; ") } : {}) },
  };
}

// Server Actions get Vercel's default time limit; stop well before it and let the browser call again.
const RESTOCK_TIME_MS = 45_000;

// Admin → Catalogus importeren → "Webshop bijwerken": puts sold made-to-order stoves back in stock
// in the web shop now instead of waiting for the nightly run (app/api/cron/restock-shop).
export async function restockMadeToOrderShopAction(): Promise<ActionResult<{ result: RestockResult }>> {
  const { isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  try {
    return { ok: true, result: await restockMadeToOrderProducts(Date.now() + RESTOCK_TIME_MS) };
  } catch (error) {
    console.error("Restocking made-to-order products failed", {
      status: error instanceof WooCommerceError ? error.status : undefined,
      code: error instanceof WooCommerceError ? error.code : undefined,
    });
    return { ok: false, error: error instanceof WooCommerceError ? error.message : "Het bijwerken van de webshop is mislukt." };
  }
}
