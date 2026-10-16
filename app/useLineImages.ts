"use client";

import { useEffect, useRef, useState } from "react";
import type { InvoiceLine } from "../lib/invoice";
import { getLineImageUrls } from "./invoice-actions";

type Source = Pick<InvoiceLine, "stove_number" | "article_id">;

const keyOf = (source: Source) => (source.article_id ? `a${source.article_id}` : source.stove_number ? `s${source.stove_number}` : null);

// The photos of the lines of a draft invoice or quote, for its PDF preview. Each stove or article is
// asked for once while the dialog is open.
export function useLineImages(lines: Source[]) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const missing = new Map<string, Source>();
    for (const line of lines) {
      const key = keyOf(line);
      if (key && !requested.current.has(key)) missing.set(key, line);
    }
    if (missing.size === 0) return;
    for (const key of missing.keys()) requested.current.add(key);
    const sources = [...missing.values()].map(({ stove_number, article_id }) => ({ stove_number: stove_number ?? null, article_id: article_id ?? null }));
    getLineImageUrls(sources)
      .then((result) => {
        if (!result.ok) return;
        const keys = [...missing.keys()];
        setUrls((current) => ({ ...current, ...Object.fromEntries(keys.map((key, index) => [key, result.urls[index]])) }));
      })
      .catch(() => {
        // Without photos the preview is still made.
      });
  }, [lines]);

  return urls;
}

/** The lines with their photos, as far as known. */
export function withLineImages<T extends InvoiceLine>(lines: T[], urls: Record<string, string | null>): T[] {
  return lines.map((line) => {
    const key = keyOf(line);
    return key && urls[key] ? { ...line, image_url: urls[key] } : line;
  });
}
