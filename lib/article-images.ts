import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

// Server-only. Article photos in the public 'article-images' bucket, named after their content so
// articles that share a photo share one file. See supabase/migrations/20261016190000_article_images.sql.

export const ARTICLE_IMAGES_BUCKET = "article-images";
export const MAX_ARTICLE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 25_000_000;
const IMAGE_EDGE_PX = 800;
const IMAGE_QUALITY = 82;

// sharp only accepts real images, so anything else is rejected here. Transparent PNGs get a white
// background instead of a black one.
async function toJpeg(bytes: Uint8Array) {
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: IMAGE_EDGE_PX, height: IMAGE_EDGE_PX, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: IMAGE_QUALITY, mozjpeg: true })
    .toBuffer();
}

/** Stores the photo (once per distinct image) and returns its public URL. */
export async function storeArticleImage(supabase: SupabaseClient, bytes: Uint8Array): Promise<string> {
  const jpeg = await toJpeg(bytes);
  const path = `${createHash("sha256").update(jpeg).digest("hex").slice(0, 32)}.jpg`;
  const { error } = await supabase.storage.from(ARTICLE_IMAGES_BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  // The same photo for another article is already there.
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
  return supabase.storage.from(ARTICLE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}
