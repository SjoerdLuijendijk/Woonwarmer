import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { storeThumbnail } from "./photo-thumbnails";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_UPLOAD, MAX_UPLOAD_BYTES, PHOTOS_BUCKET } from "./stoves";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

// A validation failure whose message is safe to show to the user.
export class UserError extends Error {}

// Validates untrusted uploads by size and content, not by the browser-supplied name or type.
export async function readPhotos(formData: FormData) {
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS_PER_UPLOAD) throw new UserError(`Maximaal ${MAX_PHOTOS_PER_UPLOAD} foto's per keer.`);
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_UPLOAD_BYTES) {
    throw new UserError("De foto's zijn samen te groot. Voeg er minder tegelijk toe.");
  }

  return Promise.all(
    files.map(async (file) => {
      if (file.size > MAX_PHOTO_BYTES) throw new UserError("Een foto is te groot.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isJpeg(bytes)) throw new UserError("Alleen foto's (JPEG) zijn toegestaan.");
      return bytes;
    }),
  );
}

export function isJpeg(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// Returns the new photo ids in the order of the given photos.
export async function storePhotos(supabase: SupabaseClient, stoveNumber: number, photos: Uint8Array[]) {
  const ids: number[] = [];
  for (const bytes of photos) {
    const path = `${stoveNumber}/${randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg" });
    if (uploadError) throw uploadError;

    const { data: row, error: rowError } = await supabase.from("stove_photos").insert({ stove_number: stoveNumber, path }).select("id").single();
    if (rowError) {
      await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
      throw rowError;
    }
    ids.push(row.id);

    // Without it the stock table shows the full photo until the thumbnail is made later.
    try {
      await storeThumbnail(supabase, path, bytes);
    } catch (thumbnailError) {
      console.error("Creating a photo thumbnail failed", { code: (thumbnailError as { code?: unknown })?.code });
    }
  }
  return ids;
}

// Storage signs at most 1000 paths per request.
const SIGN_BATCH_SIZE = 1000;

// Private bucket: hand out short-lived links for display.
export async function signPhotoUrls(supabase: SupabaseClient, paths: string[]) {
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += SIGN_BATCH_SIZE) batches.push(paths.slice(i, i + SIGN_BATCH_SIZE));
  const results = await Promise.all(
    batches.map((batch) => supabase.storage.from(PHOTOS_BUCKET).createSignedUrls(batch, SIGNED_URL_TTL_SECONDS)),
  );
  const urls = new Map<string, string>();
  for (const { data, error } of results) {
    if (error) throw error;
    for (const item of data) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}
