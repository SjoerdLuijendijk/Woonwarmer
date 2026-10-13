"use client";

import { useEffect, useRef, useState } from "react";
import { parseCsvRecords } from "../lib/csv";
import { selectHaveProducts, type HaveRecord } from "../lib/have-catalog";
import { importCatalogProductAction } from "./catalog-actions";
import { useDialog } from "./DialogProvider";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

type Problem = { name: string; message: string; failed: boolean };
type Progress = { done: number; created: number; updated: number; problems: Problem[] };

const countBy = (products: HaveRecord[], fuel: string) => products.filter((product) => product.fuel_category === fuel).length;

// Admin → Catalogus importeren: reads HAVÉ's CSV export in the browser and imports the wood and
// bio-ethanol stoves one by one as made-to-order stoves. Running it again updates them.
export default function CatalogImport() {
  const [products, setProducts] = useState<HaveRecord[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [listInShop, setListInShop] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const stopRequested = useRef(false);
  const { confirm } = useDialog();

  // Leaving the page stops the import halfway; ask first.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setProducts(null);
    setProgress(null);
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setFileError("Het bestand is groter dan 50 MB.");
    const selected = selectHaveProducts(parseCsvRecords(await file.text()));
    if (selected.length === 0) return setFileError("Geen producten gevonden. Kies de productexport (CSV) van HAVÉ Verwarming.");
    setProducts(selected);
  }

  async function start(list: HaveRecord[]) {
    const confirmed = await confirm({
      title: `${list.length} producten importeren?`,
      message: `Ze komen als kachels op bestelling in de voorraad${listInShop ? " en worden meteen online gezet in de webshop" : ""}. Laat deze pagina open tot de import klaar is; dat kan even duren.`,
      confirmLabel: "Importeren",
    });
    if (!confirmed) return;

    stopRequested.current = false;
    setRunning(true);
    const state: Progress = { done: 0, created: 0, updated: 0, problems: [] };
    setProgress({ ...state });

    // One product per call, one after the other (Next.js runs a page's Server Actions one at a time
    // anyway); each call also updates the web shop, so the shop gets one product at a time.
    for (const product of list) {
      if (stopRequested.current) break;
      const name = product.name ?? "";
      try {
        const result = await importCatalogProductAction(product, listInShop);
        if (!result.ok) state.problems.push({ name, message: result.error, failed: true });
        else {
          state[result.outcome.status]++;
          if (result.outcome.warning) state.problems.push({ name: `${name} (${result.outcome.number})`, message: result.outcome.warning, failed: false });
        }
      } catch {
        state.problems.push({ name, message: "Geen verbinding met de app.", failed: true });
      }
      state.done++;
      setProgress({ ...state, problems: [...state.problems] });
    }
    setRunning(false);
  }

  const fuels = products && { wood: countBy(products, "Hout"), ethanol: countBy(products, "Bio-ethanol") };
  const failed = progress?.problems.filter((problem) => problem.failed) ?? [];
  const warnings = progress?.problems.filter((problem) => !problem.failed) ?? [];

  return (
    <div className="catalog-import">
      <p className="muted">
        Kies de productexport (CSV) van HAVÉ Verwarming. Alleen kachels op hout en bio-ethanol die HAVÉ nog levert worden
        geïmporteerd, als kachel op bestelling. Een product dat al eerder is geïmporteerd wordt bijgewerkt (prijs, gegevens en
        beschrijving); de foto&apos;s en de webshopkeuze blijven dan zoals ze zijn.
      </p>

      <label htmlFor="catalog-file">CSV-bestand</label>
      <input id="catalog-file" type="file" accept=".csv,text/csv" onChange={handleFile} disabled={running} />
      {fileError && <p className="field-error" role="alert">{fileError}</p>}

      {products && fuels && (
        <>
          <p>
            <strong>{products.length} producten</strong> gevonden: {fuels.wood} op hout en {fuels.ethanol} op bio-ethanol.
          </p>
          <label className="checkbox-field">
            <input type="checkbox" checked={listInShop} onChange={(event) => setListInShop(event.target.checked)} disabled={running} />
            <span>Nieuwe producten meteen online zetten in de webshop</span>
          </label>
          <div className="button-row">
            {running ? (
              <button type="button" className="secondary-button" onClick={() => (stopRequested.current = true)}>
                Stoppen
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={() => start(products)}>
                Importeren
              </button>
            )}
          </div>
        </>
      )}

      {progress && products && (
        <div className="notice import-report" role="status">
          <p>
            {running ? "Bezig: " : "Klaar: "}
            {progress.done} van {products.length} verwerkt — {progress.created} nieuw, {progress.updated} bijgewerkt
            {failed.length > 0 && `, ${failed.length} mislukt`}.
          </p>
          {running && <progress value={progress.done} max={products.length} aria-label="Voortgang van de import" />}
          {failed.length > 0 && (
            <>
              <p><strong>Mislukt</strong> (importeer het bestand opnieuw om het nog eens te proberen):</p>
              <ul>{failed.map((problem, index) => <li key={index}>{problem.name}: {problem.message}</li>)}</ul>
            </>
          )}
          {warnings.length > 0 && (
            <>
              <p><strong>Opgeslagen, maar met een waarschuwing:</strong></p>
              <ul>{warnings.map((problem, index) => <li key={index}>{problem.name}: {problem.message}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
