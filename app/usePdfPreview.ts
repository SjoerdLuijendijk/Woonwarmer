"use client";

import { useEffect, useRef, useState } from "react";

const PREVIEW_DELAY_MS = 400;

/**
 * Object URL of a live PDF preview, rebuilt shortly after the last change of `build` (pass a memoized
 * function, or null while the data is not there yet). The previous URL is released each time.
 */
export function usePdfPreview(build: (() => Promise<Uint8Array>) | null) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!build) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const bytes = await build();
      if (cancelled) return;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [build]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  return previewUrl;
}
