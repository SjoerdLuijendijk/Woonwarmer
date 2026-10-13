import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { PHOTOS_BUCKET } from "./stoves";

// Server-only. Small copies of the stove photos for the stock table, stored next to each photo as
// "<stove number>/<uuid>-thumb.jpg". The full photo is only loaded when it is opened.

const THUMB_EDGE_PX = 320;
const THUMB_QUALITY = 75;

export function thumbnailPath(path: string) {
  return path.replace(/\.jpg$/, "-thumb.jpg");
}

// Only called with bytes that were checked to be a JPEG.
export async function storeThumbnail(supabase: SupabaseClient, path: string, jpeg: Uint8Array) {
  const thumbnail = await sharp(jpeg)
    .rotate()
    .resize({ width: THUMB_EDGE_PX, height: THUMB_EDGE_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(thumbnailPath(path), thumbnail, { contentType: "image/jpeg" });
  // Another request made it in the meantime.
  if (error && !("statusCode" in error && error.statusCode === "409")) throw error;
}
