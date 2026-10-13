"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { MAX_AD_PROMPT_LENGTH, MAX_AD_TEXT_LENGTH } from "../lib/ad-prompt";
import { requireTeamMember } from "../lib/auth";
import { AdGenerationError } from "../lib/marketplace-ad";
import { generateAndStoreAd, getStoredAd, saveManualAd } from "../lib/marketplace-ad-store";
import { syncStoveToShop } from "../lib/woocommerce/sync";
import type { ActionResult } from "./actions";

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de voorraad." } as const;
const FAILED = { ok: false, error: "Er ging iets mis. Probeer het opnieuw." } as const;
const NOT_FOUND = { ok: false, error: "Kachel niet gevonden." } as const;

export type MarketplaceAd = { text: string; edited: boolean; outdated: boolean };

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

// The ad is the web shop's product description; update the product after the response.
function syncShopLater(supabase: Parameters<typeof syncStoveToShop>[0], stoveNumber: number) {
  after(() => syncStoveToShop(supabase, stoveNumber));
}

function failure(error: unknown, context: string) {
  if (error instanceof AdGenerationError) return { ok: false as const, error: error.message };
  console.error(context, { code: (error as { code?: unknown })?.code });
  return FAILED;
}

// Returns the stored ad, or generates and stores one when there is none yet or regenerate is set.
// The ad is always built from the stored stove data, never from values sent by the browser.
export async function getMarketplaceAd(stoveNumber: number, regenerate: boolean): Promise<ActionResult<{ ad: MarketplaceAd }>> {
  if (!isPositiveId(stoveNumber) || typeof regenerate !== "boolean") return { ok: false, error: "Onbekende kachel." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  try {
    if (!regenerate) {
      const stored = await getStoredAd(supabase, stoveNumber);
      if (!stored) return NOT_FOUND;
      if (stored.text) return { ok: true, ad: { text: stored.text, edited: stored.edited, outdated: stored.outdated } };
    }
    const text = await generateAndStoreAd(supabase, stoveNumber);
    if (text === null) return NOT_FOUND;
    syncShopLater(supabase, stoveNumber);
    return { ok: true, ad: { text, edited: false, outdated: false } };
  } catch (error) {
    return failure(error, "Getting marketplace ad failed");
  }
}

export async function saveMarketplaceAd(stoveNumber: number, text: unknown): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber)) return { ok: false, error: "Onbekende kachel." };
  if (typeof text !== "string" || text.trim().length === 0) return { ok: false, error: "De advertentietekst is leeg." };
  if (text.length > MAX_AD_TEXT_LENGTH) return { ok: false, error: `De advertentietekst mag maximaal ${MAX_AD_TEXT_LENGTH} tekens zijn.` };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  try {
    if (!(await saveManualAd(supabase, stoveNumber, text.trim()))) return NOT_FOUND;
    syncShopLater(supabase, stoveNumber);
    return { ok: true };
  } catch (error) {
    return failure(error, "Saving marketplace ad failed");
  }
}

export async function saveAdPrompt(formData: FormData): Promise<ActionResult> {
  const prompt = formData.get("prompt");
  if (typeof prompt !== "string" || prompt.trim().length === 0) return { ok: false, error: "Vul een prompt in." };
  if (prompt.length > MAX_AD_PROMPT_LENGTH) return { ok: false, error: `De prompt mag maximaal ${MAX_AD_PROMPT_LENGTH} tekens zijn.` };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { error } = await supabase.from("ad_settings").upsert({ id: true, prompt: prompt.trim(), updated_at: new Date().toISOString() });
  if (error) {
    console.error("Saving ad prompt failed", { code: error.code });
    return FAILED;
  }
  revalidatePath("/");
  return { ok: true };
}
