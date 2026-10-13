import type { SupabaseClient } from "@supabase/supabase-js";
import { storeThumbnail, thumbnailPath } from "./photo-thumbnails";
import { isJpeg, signPhotoUrls } from "./stove-photos";
import { PHOTOS_BUCKET } from "./stoves";

// Server-only. Photos stored before thumbnails existed get one when the stock page asks for it, a
// few per call so each call stays short. Newest photos first.

const BATCH_SIZE = 8;

export async function createMissingThumbnails(supabase: SupabaseClient): Promise<{ created: number; remaining: number }> {
  const { data, error } = await supabase.from("stove_photos").select("path").order("id", { ascending: false });
  if (error) throw error;

  const paths = data.map((photo) => photo.path);
  // A thumbnail that does not exist gets no signed link.
  const existing = await signPhotoUrls(supabase, paths.map(thumbnailPath));
  const missing = paths.filter((path) => !existing.has(thumbnailPath(path)));

  let created = 0;
  for (const path of missing.slice(0, BATCH_SIZE)) {
    try {
      const { data: file, error: downloadError } = await supabase.storage.from(PHOTOS_BUCKET).download(path);
      if (downloadError) throw downloadError;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isJpeg(bytes)) continue;
      await storeThumbnail(supabase, path, bytes);
      created++;
    } catch (thumbnailError) {
      console.error("Creating a photo thumbnail failed", { code: (thumbnailError as { code?: unknown })?.code });
    }
  }
  return { created, remaining: missing.length - created };
}
