import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompany } from "./invoice-queries";
import { AdGenerationError, generateMarketplaceAd } from "./marketplace-ad";
import { getStoveDetails } from "./stove-queries";

// Server-only. All queries use the caller's client, so RLS limits them to team members.

export type StoredAd = {
  text: string | null;
  /** Changed by hand; edits to the stove no longer regenerate it. */
  edited: boolean;
  /** The stove was edited after the manual change. */
  outdated: boolean;
};

export async function getAdPrompt(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("ad_settings").select("prompt").maybeSingle();
  if (error) throw error;
  return data?.prompt ?? null;
}

// Null: the stove does not exist.
export async function getStoredAd(supabase: SupabaseClient, stoveNumber: number): Promise<StoredAd | null> {
  const { data, error } = await supabase
    .from("stoves")
    .select("marketplace_ad, marketplace_ad_edited, marketplace_ad_outdated")
    .eq("number", stoveNumber)
    .maybeSingle();
  if (error) throw error;
  return data ? { text: data.marketplace_ad, edited: data.marketplace_ad_edited, outdated: data.marketplace_ad_outdated } : null;
}

// Returns false when the stove does not exist.
async function updateStoredAd(supabase: SupabaseClient, stoveNumber: number, values: Record<string, string | boolean>) {
  const { data, error } = await supabase.from("stoves").update(values).eq("number", stoveNumber).select("number");
  if (error) throw error;
  return data.length > 0;
}

// Generates the ad from the stored stove, company details and prompt, and saves it on the stove,
// replacing any manual version. Returns null when the stove does not exist.
export async function generateAndStoreAd(supabase: SupabaseClient, stoveNumber: number): Promise<string | null> {
  const [stove, company, prompt] = await Promise.all([getStoveDetails(supabase, stoveNumber), getCompany(supabase), getAdPrompt(supabase)]);
  if (!stove) return null;

  const text = await generateMarketplaceAd(stove, company, prompt);
  const saved = await updateStoredAd(supabase, stoveNumber, { marketplace_ad: text, marketplace_ad_edited: false, marketplace_ad_outdated: false });
  return saved ? text : null;
}

export async function saveManualAd(supabase: SupabaseClient, stoveNumber: number, text: string) {
  return updateStoredAd(supabase, stoveNumber, { marketplace_ad: text, marketplace_ad_edited: true, marketplace_ad_outdated: false });
}

// Runs in the background after a stove is added or edited. A generated ad is regenerated so it
// matches the stove; a manually changed ad is kept and flagged for checking instead.
// Failures are logged, never thrown; the ad is then generated when someone opens it.
export async function refreshStoredAd(supabase: SupabaseClient, stoveNumber: number) {
  try {
    const stored = await getStoredAd(supabase, stoveNumber);
    if (!stored) return;
    if (stored.edited) await updateStoredAd(supabase, stoveNumber, { marketplace_ad_outdated: true });
    else await generateAndStoreAd(supabase, stoveNumber);
  } catch (error) {
    if (error instanceof AdGenerationError) return; // Already logged without details.
    console.error("Background marketplace ad failed", { code: (error as { code?: unknown })?.code });
  }
}
