"use client";

import { useEffect, useState } from "react";
import type { RestockFailure } from "../lib/woocommerce/stock";
import { restockMadeToOrderShopAction } from "./catalog-actions";

type Outcome = { updated: number; failed: RestockFailure[]; finished: boolean };
// Each call stops after about 45 seconds; this many calls cover far more products than the shop has.
const MAX_CALLS = 20;

// Puts sold made-to-order stoves back in stock in the web shop right away; the app also does this
// every night. Other product details are left alone.
export default function ShopResync() {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  async function start() {
    setError(null);
    setRunning(true);
    const total: Outcome = { updated: 0, failed: [], finished: false };
    setOutcome({ ...total });
    for (let call = 0; call < MAX_CALLS && !total.finished; call++) {
      const response = await restockMadeToOrderShopAction().catch(() => null);
      if (!response || !response.ok) {
        setError(response ? response.error : "Geen verbinding met de app.");
        break;
      }
      total.updated += response.result.updated;
      total.failed.push(...response.result.failed);
      total.finished = response.result.finished;
      setOutcome({ ...total, failed: [...total.failed] });
    }
    setRunning(false);
  }

  return (
    <div className="catalog-import">
      <h2>Webshop bijwerken</h2>
      <p className="muted">
        Een verkochte kachel op bestelling die online staat, krijgt in de webshop weer voorraad 1, zodat hij op Marktplaats
        blijft. Dit gebeurt elke nacht vanzelf; met deze knop meteen. Prijzen, teksten en foto&apos;s blijven zoals ze zijn.
      </p>
      <div className="button-row">
        <button type="button" className="primary-button" onClick={start} disabled={running}>
          {running ? "Bezig…" : "Voorraad nu bijwerken"}
        </button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {outcome && (
        <div className="notice import-report" role="status">
          <p>
            {running ? "Bezig: " : "Klaar: "}
            {outcome.updated} {outcome.updated === 1 ? "kachel" : "kachels"} weer op voorraad gezet
            {outcome.failed.length > 0 && `, ${outcome.failed.length} mislukt`}.
          </p>
          {outcome.failed.length > 0 && (
            <ul>{outcome.failed.map(({ sku, message }) => <li key={sku}>Kachel {sku}: {message}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
