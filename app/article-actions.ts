"use server";

import { revalidatePath } from "next/cache";
import { MAX_ARTICLE_IMAGE_BYTES, storeArticleImage } from "../lib/article-images";
import { requireTeamMember } from "../lib/auth";
import { ARTICLE_COLUMNS, MAX_CSV_BYTES, MAX_MARKUP_PCT, parseArticle, readArticleCsv, toArticle, toArticleRow, type ArticleInput, type ArticleRow, type RawArticle } from "../lib/articles";
import type { ActionResult } from "./actions";

const NO_ACCESS = { ok: false, error: "Je hebt geen toegang tot de artikelen." } as const;
const FAILED = { ok: false, error: "Er ging iets mis. Probeer het opnieuw." } as const;
// Postgres error code for a duplicate key (here: the SKU).
const UNIQUE_VIOLATION = "23505";
// Upper bound for one bulk delete, so the id filter stays well within request URL limits.
const MAX_BULK_DELETE = 500;

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function rawFromForm(formData: FormData): RawArticle {
  const raw: RawArticle = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") raw[key as keyof RawArticle] = value;
  return raw;
}

// Sets the markup on purchase prices that articles without a sale price of their own are sold at.
export async function saveArticleMarkup(value: unknown): Promise<ActionResult> {
  const text = typeof value === "string" ? value.trim().replace("%", "").replace(",", ".") : "";
  const markupPct = /^\d{1,4}(\.\d{1,2})?$/.test(text) ? Number(text) : NaN;
  if (!(markupPct >= 0 && markupPct <= MAX_MARKUP_PCT)) return { ok: false, error: `Vul een opslag in van 0 tot ${MAX_MARKUP_PCT}%, bijvoorbeeld 40 of 37,5.` };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { data, error } = await supabase
    .from("article_settings")
    .update({ markup_pct: markupPct, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");
  if (error || data.length === 0) {
    console.error("Saving article markup failed", { code: error?.code });
    return FAILED;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// Sets the photo of the article with this SKU (Artikelen → Afbeeldingen importeren: the file is
// named after the SKU). A "/" cannot be in a file name, so "0502_31001" also finds "0502/31001" when
// no article has the name exactly. Articles that share a photo share one stored file.
export async function importArticleImage(formData: FormData): Promise<ActionResult> {
  const sku = formData.get("sku");
  const file = formData.get("file");
  if (typeof sku !== "string" || sku.trim().length === 0 || sku.length > 100) return { ok: false, error: "Onbekend artikelnummer." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Geen afbeelding." };
  if (file.size > MAX_ARTICLE_IMAGE_BYTES) return { ok: false, error: "De afbeelding is groter dan 5 MB." };

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const exact = sku.trim();
  const candidates = [...new Set([exact, exact.replaceAll("_", "/")])];
  const { data: found, error: findError } = await supabase.from("articles").select("id, sku").in("sku", candidates);
  if (findError) return FAILED;
  const article = found.find((row) => row.sku === exact) ?? found[0];
  if (!article) return { ok: false, error: `Geen artikel met nummer ${exact}.` };

  let imageUrl: string;
  try {
    imageUrl = await storeArticleImage(supabase, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    // sharp rejects files that are not images; storage errors carry no personal data.
    console.error("Storing article image failed", { message: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "Dit bestand kon niet als afbeelding worden opgeslagen." };
  }

  const { error } = await supabase.from("articles").update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq("id", article.id);
  if (error) return FAILED;
  return { ok: true };
}

// Adds an article (id null) or updates one.
export async function saveArticle(id: number | null, formData: FormData): Promise<ActionResult> {
  if (id !== null && !isPositiveId(id)) return { ok: false, error: "Onbekend artikel." };
  const parsed = parseArticle(rawFromForm(formData));
  if (!parsed.ok) return parsed;

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const row = { ...toArticleRow(parsed.value), updated_at: new Date().toISOString() };
  const { data, error } = id === null
    ? await supabase.from("articles").insert(row).select("id")
    : await supabase.from("articles").update(row).eq("id", id).select("id");
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "Er is al een artikel met dit artikelnummer." };
  if (error) return FAILED;
  if (data.length === 0) return { ok: false, error: "Dit artikel bestaat niet meer." };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteArticle(id: number): Promise<ActionResult> {
  if (!isPositiveId(id)) return { ok: false, error: "Onbekend artikel." };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { error } = await supabase.from("articles").delete().eq("id", id);
  if (error) return FAILED;
  revalidatePath("/", "layout");
  return { ok: true };
}

// Deletes the articles selected in the article list in one go.
export async function deleteArticles(ids: number[]): Promise<ActionResult> {
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isPositiveId)) return { ok: false, error: "Onbekende artikelen." };
  if (ids.length > MAX_BULK_DELETE) return { ok: false, error: `Verwijder maximaal ${MAX_BULK_DELETE} artikelen tegelijk.` };
  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;

  const { error } = await supabase.from("articles").delete().in("id", ids);
  if (error) return FAILED;
  revalidatePath("/", "layout");
  return { ok: true };
}

export type ImportReport = { created: number; updated: number; skipped: { line: number; reason: string }[] };

// Imports the supplier CSV. An article with the same SKU is updated, others are added. Empty cells
// keep the value already stored, so prices entered in the app survive a new import without prices.
// Rows without a SKU, with invalid values, or with a SKU that occurs more than once are skipped.
export async function importArticles(csvText: string): Promise<ActionResult<{ report: ImportReport }>> {
  if (typeof csvText !== "string" || csvText.length === 0) return { ok: false, error: "Het bestand is leeg." };
  if (csvText.length > MAX_CSV_BYTES) return { ok: false, error: "Het bestand is groter dan 1 MB." };
  const csv = readArticleCsv(csvText);
  if (!csv.ok) return csv;

  const report: ImportReport = { created: 0, updated: 0, skipped: [] };
  const linesBySku = new Map<string, number[]>();
  const valid: { line: number; article: ArticleInput; sku: string }[] = [];
  for (const { line, raw } of csv.value) {
    const parsed = parseArticle(raw);
    if (!parsed.ok) {
      report.skipped.push({ line, reason: parsed.error });
      continue;
    }
    const sku = parsed.value.sku;
    if (!sku) {
      report.skipped.push({ line, reason: "Geen artikelnummer (sku)." });
      continue;
    }
    linesBySku.set(sku, [...(linesBySku.get(sku) ?? []), line]);
    valid.push({ line, article: parsed.value, sku });
  }
  const rows = valid.filter(({ line, sku }) => {
    const lines = linesBySku.get(sku)!;
    if (lines.length === 1) return true;
    report.skipped.push({ line, reason: `Artikelnummer ${sku} staat meerdere keren in het bestand (regels ${lines.join(", ")}).` });
    return false;
  });

  const { supabase, isMember } = await requireTeamMember();
  if (!isMember) return NO_ACCESS;
  if (rows.length === 0) return { ok: true, report };

  const existing = await supabase.from("articles").select(ARTICLE_COLUMNS).in("sku", rows.map(({ sku }) => sku));
  if (existing.error) return FAILED;
  const bySku = new Map((existing.data as ArticleRow[]).map((row) => [row.sku, toArticle(row)]));

  const now = new Date().toISOString();
  const upserts = rows.map(({ article, sku }) => {
    const stored = bySku.get(sku);
    if (stored) report.updated += 1;
    else report.created += 1;
    // Empty cells keep the stored value.
    const merged = stored
      ? (Object.fromEntries(Object.entries(article).map(([key, value]) => [key, value ?? stored[key as keyof ArticleInput]])) as ArticleInput)
      : article;
    return { ...toArticleRow(merged), updated_at: now };
  });

  const { error } = await supabase.from("articles").upsert(upserts, { onConflict: "sku" });
  if (error) return FAILED;

  revalidatePath("/", "layout");
  return { ok: true, report };
}
