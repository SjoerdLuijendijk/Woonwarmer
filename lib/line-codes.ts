import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineSource } from "./line-images";

// Server-only. The article code shown next to a quote line, for ordering: the article's SKU or, for a
// stove imported from a supplier's catalogue, the supplier's article number. Read when the quote is
// read, so a changed SKU shows on the quote too.

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** One code (or null) per source, in the same order. */
export async function lineCodes(supabase: SupabaseClient, sources: LineSource[]): Promise<(string | null)[]> {
  const articleIds = [...new Set(sources.map((source) => source.article_id).filter(isId))];
  const stoveNumbers = [...new Set(sources.map((source) => source.stove_number).filter(isId))];

  const [articles, stoves] = await Promise.all([
    articleIds.length ? supabase.from("articles").select("id, sku").in("id", articleIds) : null,
    stoveNumbers.length ? supabase.from("stoves").select("number, supplier_sku").in("number", stoveNumbers) : null,
  ]);
  if (articles?.error) throw articles.error;
  if (stoves?.error) throw stoves.error;

  const articleCodes = new Map((articles?.data ?? []).map((row) => [row.id as number, row.sku as string | null]));
  const stoveCodes = new Map((stoves?.data ?? []).map((row) => [row.number as number, row.supplier_sku as string | null]));
  return sources.map(
    (source) => (isId(source.article_id) && articleCodes.get(source.article_id)) || (isId(source.stove_number) && stoveCodes.get(source.stove_number)) || null,
  );
}
