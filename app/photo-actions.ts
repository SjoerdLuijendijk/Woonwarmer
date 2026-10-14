"use server";

import { requireTeamMember } from "../lib/auth";
import { getStovePhotos } from "../lib/stove-queries";
import type { StovePhoto } from "../lib/stoves";
import type { ActionResult } from "./actions";

// All photos of one stove; the stock page only has the main photo of each stove.
export async function loadStovePhotos(stoveNumber: number): Promise<ActionResult<{ photos: StovePhoto[] }>> {
  if (!Number.isSafeInteger(stoveNumber) || stoveNumber <= 0) return { ok: false, error: "Onbekende kachel." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return { ok: false, error: "Je hebt geen toegang tot de voorraad." };

  try {
    return { ok: true, photos: await getStovePhotos(supabase, stoveNumber) };
  } catch (error) {
    console.error("Loading stove photos failed", { stoveNumber, code: (error as { code?: unknown })?.code });
    return { ok: false, error: "De foto's konden niet worden geladen." };
  }
}
