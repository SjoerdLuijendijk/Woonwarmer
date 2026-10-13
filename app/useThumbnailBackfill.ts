"use client";

import { useEffect, useRef } from "react";
import type { Stove } from "../lib/stoves";
import { createMissingPhotoThumbnails } from "./actions";

// Asks the server to make thumbnails for older photos while the stock page is open. They show up on
// the next page load. Stops when nothing is left, or when a call makes no progress.
export function useThumbnailBackfill(stoves: Stove[]) {
  const missing = stoves.some((stove) => stove.photos.some((photo) => photo.url && !photo.thumbUrl));
  const started = useRef(false);

  useEffect(() => {
    if (!missing || started.current) return;
    started.current = true;
    (async () => {
      try {
        for (;;) {
          const result = await createMissingPhotoThumbnails();
          if (!result.ok || result.remaining === 0 || result.created === 0) break;
        }
      } catch {
        // A background convenience: the full photos keep working without thumbnails.
      }
    })();
  }, [missing]);
}
