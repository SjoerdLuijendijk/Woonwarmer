import type { SupabaseClient } from "@supabase/supabase-js";
import { thumbnailPath } from "./photo-thumbnails";
import { signPhotoUrls } from "./stove-photos";

// Server-only. The photo shown next to an invoice or quote line: the article's photo (a public URL)
// or the stove's main photo (a short-lived signed link, the small copy when there is one).

export type LineSource = { stove_number?: number | null; article_id?: number | null };

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** One URL (or null) per source, in the same order. */
export async function lineImageUrls(supabase: SupabaseClient, sources: LineSource[]): Promise<(string | null)[]> {
  const articleIds = [...new Set(sources.map((source) => source.article_id).filter(isId))];
  const stoveNumbers = [...new Set(sources.map((source) => source.stove_number).filter(isId))];

  const [articles, photos] = await Promise.all([
    articleIds.length ? supabase.from("articles").select("id, image_url").in("id", articleIds) : null,
    stoveNumbers.length ? supabase.from("stove_photos").select("stove_number, path").in("stove_number", stoveNumbers).order("id") : null,
  ]);
  if (articles?.error) throw articles.error;
  if (photos?.error) throw photos.error;

  const articleImages = new Map((articles?.data ?? []).map((row) => [row.id as number, row.image_url as string | null]));
  // The first photo of a stove is its main photo.
  const mainPaths = new Map<number, string>();
  for (const row of photos?.data ?? []) if (!mainPaths.has(row.stove_number)) mainPaths.set(row.stove_number, row.path);
  const paths = [...mainPaths.values()];
  const [full, thumbs] = paths.length
    ? await Promise.all([
        signPhotoUrls(supabase, paths),
        // Thumbnails are optional: without one the full photo is used.
        signPhotoUrls(supabase, paths.map(thumbnailPath)).catch(() => new Map<string, string>()),
      ])
    : [new Map<string, string>(), new Map<string, string>()];
  const stoveImage = (stoveNumber: number) => {
    const path = mainPaths.get(stoveNumber);
    return path ? (thumbs.get(thumbnailPath(path)) ?? full.get(path) ?? null) : null;
  };

  return sources.map((source) => {
    if (isId(source.article_id)) return articleImages.get(source.article_id) ?? null;
    if (isId(source.stove_number)) return stoveImage(source.stove_number);
    return null;
  });
}
