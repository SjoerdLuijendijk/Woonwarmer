"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { importArticleImage } from "./article-actions";

type Failure = { name: string; reason: string };

// "Afbeeldingen importeren": each chosen image is named after an article number (EK150001.png) and
// becomes that article's photo. One file per Server Action call, one after the other; the page must
// stay open, and running it again simply replaces the photos.
export default function ArticleImageImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [finished, setFinished] = useState(false);
  const running = progress !== null && progress.done < progress.total;

  // Leaving the page stops the import halfway; ask first.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setFailures([]);
    setFinished(false);
    setProgress({ done: 0, total: files.length });
    for (const [index, file] of files.entries()) {
      const formData = new FormData();
      formData.set("sku", file.name.replace(/\.[^.]+$/, ""));
      formData.set("file", file);
      try {
        const result = await importArticleImage(formData);
        if (!result.ok) setFailures((current) => [...current, { name: file.name, reason: result.error }]);
      } catch {
        setFailures((current) => [...current, { name: file.name, reason: "Geen verbinding; probeer het opnieuw." }]);
      }
      setProgress({ done: index + 1, total: files.length });
    }
    setFinished(true);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="secondary-button toolbar-button" onClick={() => inputRef.current?.click()} disabled={running}>
        {running ? `Afbeeldingen ${progress.done} van ${progress.total}…` : "Afbeeldingen importeren"}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleFiles} />
      {finished && progress && (
        <div className="notice import-report" role="status">
          <p>
            <strong>Afbeeldingen klaar:</strong> {progress.total - failures.length} van {progress.total} gekoppeld
            {failures.length > 0 && `, ${failures.length} niet`}.
          </p>
          {failures.length > 0 && (
            <ul>
              {failures.map(({ name, reason }) => <li key={name}>{name}: {reason}</li>)}
            </ul>
          )}
          <button type="button" className="text-button" onClick={() => { setFinished(false); setProgress(null); }}>Sluiten</button>
        </div>
      )}
    </>
  );
}
