"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { listMadeToOrderShopStoves, resyncShopStove } from "./catalog-actions";
import { useDialog } from "./DialogProvider";

type Progress = { done: number; total: number; failed: { number: number; message: string }[] };

// Sends every made-to-order stove to the web shop again, one by one, for example after the way
// they are sent has changed. Shop sync errors also show on the stoves in the stock page.
export default function ShopResync() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRequested = useRef(false);
  const { confirm } = useDialog();
  const router = useRouter();

  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  async function start() {
    setError(null);
    const list = await listMadeToOrderShopStoves().catch(() => null);
    if (!list) return setError("Geen verbinding met de app.");
    if (!list.ok) return setError(list.error);
    if (list.numbers.length === 0) return setError("Er staan geen kachels op bestelling in de webshop.");

    const confirmed = await confirm({
      title: `${list.numbers.length} kachels bijwerken in de webshop?`,
      message: "Elke kachel op bestelling wordt opnieuw naar de webshop gestuurd. Laat deze pagina open tot het klaar is.",
      confirmLabel: "Bijwerken",
    });
    if (!confirmed) return;

    stopRequested.current = false;
    setRunning(true);
    const state: Progress = { done: 0, total: list.numbers.length, failed: [] };
    setProgress({ ...state });
    for (const number of list.numbers) {
      if (stopRequested.current) break;
      try {
        const result = await resyncShopStove(number);
        if (!result.ok) state.failed.push({ number, message: result.error });
      } catch {
        state.failed.push({ number, message: "Geen verbinding met de app." });
      }
      state.done++;
      setProgress({ ...state, failed: [...state.failed] });
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="catalog-import">
      <h2>Webshop bijwerken</h2>
      <p className="muted">Stuurt alle kachels op bestelling opnieuw naar de webshop, met hun huidige gegevens.</p>
      <div className="button-row">
        {running ? (
          <button type="button" className="secondary-button" onClick={() => (stopRequested.current = true)}>Stoppen</button>
        ) : (
          <button type="button" className="primary-button" onClick={start}>Kachels op bestelling bijwerken</button>
        )}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {progress && (
        <div className="notice import-report" role="status">
          <p>
            {running ? "Bezig: " : "Klaar: "}
            {progress.done} van {progress.total} bijgewerkt{progress.failed.length > 0 && `, ${progress.failed.length} mislukt`}.
          </p>
          {running && <progress value={progress.done} max={progress.total} aria-label="Voortgang" />}
          {progress.failed.length > 0 && (
            <ul>{progress.failed.map(({ number, message }) => <li key={number}>Kachel {number}: {message}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
