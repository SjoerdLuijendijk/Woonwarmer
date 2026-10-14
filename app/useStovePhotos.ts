"use client";

import { useCallback, useEffect, useState } from "react";
import type { StovePhoto } from "../lib/stoves";
import { loadStovePhotos } from "./photo-actions";

// Loads all photos of a stove when the component mounts, so a dialog opened again starts fresh.
// Until they arrive (or when loading fails) only the main photo is known. reload() fetches them
// again, for example after a photo was added or deleted.
export function useStovePhotos(stoveNumber: number, mainPhoto: StovePhoto | null) {
  const [photos, setPhotos] = useState<StovePhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await loadStovePhotos(stoveNumber);
    if (result.ok) {
      setPhotos(result.photos);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [stoveNumber]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { photos: photos ?? (mainPhoto ? [mainPhoto] : []), loading: photos === null && !error, error, reload };
}
