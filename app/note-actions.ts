"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireTeamMember } from "../lib/auth";
import { toNoteRow } from "../lib/stove-note-queries";
import { isEmptyNote, parseStoveNote } from "../lib/stove-notes";
import { syncStoveToShop } from "../lib/woocommerce/sync";
import { adjustStoveStock, type ActionResult } from "./actions";

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de voorraad." } as const;
// Postgres error codes: a violated check constraint (the stove is sold out), and an exception raised
// by the stove_notes trigger (a status change that is not allowed).
const CHECK_VIOLATION = "23514";
const RAISED_EXCEPTION = "P0001";

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

// Adds a note (noteId null) or updates one. A note that becomes sold takes one unit from the stock
// in the same database statement. A sale delivered straight away is closed as delivered at once; one
// without any details only lowers the stock, so no empty note is left behind.
export async function saveStoveNote(stoveNumber: number, noteId: number | null, formData: FormData): Promise<ActionResult> {
  if (!isPositiveId(stoveNumber) || (noteId !== null && !isPositiveId(noteId))) return { ok: false, error: "Onbekende notitie." };

  const parsed = parseStoveNote(formData);
  if (!parsed.ok) return parsed;
  const note = parsed.value;

  if (noteId === null) {
    if (note.status !== "negotiating" && note.status !== "sold") return { ok: false, error: "Een nieuwe notitie is in onderhandeling of verkocht." };
  }

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  if (noteId === null && note.deliveredNow && isEmptyNote(note)) {
    // A made-to-order stove keeps no stock, so an empty sale leaves nothing to record.
    const { data: stove, error } = await supabase.from("stoves").select("made_to_order").eq("number", stoveNumber).maybeSingle();
    if (error) return { ok: false, error: "Er ging iets mis. Probeer het opnieuw." };
    if (!stove) return { ok: false, error: "Deze kachel bestaat niet meer." };
    return stove.made_to_order ? { ok: true } : adjustStoveStock(stoveNumber, -1);
  }

  const { data, error } =
    noteId === null
      ? await supabase.from("stove_notes").insert({ stove_number: stoveNumber, ...toNoteRow(note) }).select("id")
      : await supabase.from("stove_notes").update(toNoteRow(note)).eq("id", noteId).eq("stove_number", stoveNumber).select("id");
  if (error?.code === CHECK_VIOLATION) return { ok: false, error: "Deze kachel is al uitverkocht." };
  if (error?.code === RAISED_EXCEPTION) return { ok: false, error: "Deze statuswijziging is niet mogelijk. Ververs de pagina en probeer het opnieuw." };
  if (error) return { ok: false, error: "Er ging iets mis. Probeer het opnieuw." };
  if (data.length === 0) return { ok: false, error: "Deze notitie bestaat niet meer." };

  if (note.deliveredNow) {
    // The stock already changed with the sale above; a failure here leaves the note "to deliver".
    const delivered = await supabase.from("stove_notes").update({ status: "done" }).eq("id", data[0].id);
    if (delivered.error) {
      after(() => syncStoveToShop(supabase, stoveNumber));
      revalidatePath("/", "layout");
      return { ok: false, error: "De verkoop is opgeslagen, maar niet als afgeleverd. Zet hem via de status op Afgeleverd." };
    }
  }

  // Selling changes the stock, which the web shop shows.
  if (note.status === "sold") after(() => syncStoveToShop(supabase, stoveNumber));
  revalidatePath("/", "layout");
  return { ok: true };
}

// Closes a note without changing its details: done (delivered) or cancelled. Restocking after
// a cancelled sale is a separate step the user confirms.
export async function closeStoveNote(noteId: number, status: "done" | "cancelled"): Promise<ActionResult> {
  if (!isPositiveId(noteId) || (status !== "done" && status !== "cancelled")) return { ok: false, error: "Onbekende notitie." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase.from("stove_notes").update({ status }).eq("id", noteId).select("id");
  if (error?.code === RAISED_EXCEPTION) return { ok: false, error: "Deze statuswijziging is niet mogelijk. Ververs de pagina en probeer het opnieuw." };
  if (error) return { ok: false, error: "Er ging iets mis. Probeer het opnieuw." };
  if (data.length === 0) return { ok: false, error: "Deze notitie bestaat niet meer." };

  revalidatePath("/", "layout");
  return { ok: true };
}
