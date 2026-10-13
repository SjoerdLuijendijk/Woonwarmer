"use client";

import { useState, useTransition } from "react";
import { RESET_BATCH_SIZE } from "../lib/shop-reset-batch";
import type { ResetStoveResult, ShopProductSummary } from "../lib/woocommerce/shop-reset";
import { useDialog } from "./DialogProvider";
import { getResetStoveNumbers, listUnownedShopProducts, resetStoveBatch, unpublishUnownedShopProducts } from "./shop-reset-actions";

type Failure = { number: number; reason: string };

// TEMPORARY: the one-off reset that makes the app the only source of the web shop. Step 1 renews
// every ad and pushes every stove; step 2 takes offline what no stove in the app owns.
export default function ShopResetPanel() {
  const { confirm } = useDialog();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<Failure[]>([]);
  const [stepOneDone, setStepOneDone] = useState(false);
  const [unowned, setUnowned] = useState<ShopProductSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function processStoves(numbers: number[]) {
    setError(null);
    setFailed([]);
    setStepOneDone(false);
    setProgress({ done: 0, total: numbers.length });
    const failures: Failure[] = [];
    for (let start = 0; start < numbers.length; start += RESET_BATCH_SIZE) {
      const batch = numbers.slice(start, start + RESET_BATCH_SIZE);
      const result = await resetStoveBatch(batch);
      const results: ResetStoveResult[] = result.ok ? result.results : batch.map((number) => ({ number, error: result.error }));
      failures.push(...results.flatMap(({ number, error: reason }) => (reason ? [{ number, reason }] : [])));
      setFailed([...failures]);
      setProgress({ done: start + batch.length, total: numbers.length });
    }
    setStepOneDone(true);
  }

  async function startReset() {
    const confirmed = await confirm({
      title: "Alle advertentieteksten vernieuwen en alles naar de webshop sturen?",
      message:
        "Van elke kachel die nog te koop is wordt de advertentietekst opnieuw gemaakt, ook als die met de hand is aangepast. Daarna wordt elke kachel naar de webshop gestuurd met de gegevens uit de app. Dit duurt een tijd en kost per kachel een OpenAI-aanroep. Houd deze pagina open tot het klaar is.",
      confirmLabel: "Starten",
      danger: true,
    });
    if (!confirmed) return;
    startTransition(async () => {
      const list = await getResetStoveNumbers();
      if (!list.ok) return setError(list.error);
      await processStoves(list.numbers);
    });
  }

  function retryFailed() {
    startTransition(() => processStoves(failed.map(({ number }) => number)));
  }

  function checkUnowned() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await listUnownedShopProducts();
      if (!result.ok) return setError(result.error);
      setUnowned(result.products);
    });
  }

  async function unpublish() {
    if (!unowned || unowned.length === 0) return;
    const confirmed = await confirm({
      title: `${unowned.length} product${unowned.length === 1 ? "" : "en"} offline halen?`,
      message: "Deze producten worden in WooCommerce op concept gezet, zodat ze niet meer online staan. Ze worden niet verwijderd; je kunt ze in WordPress weer publiceren.",
      confirmLabel: "Offline halen",
      danger: true,
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await unpublishUnownedShopProducts(unowned.map(({ id }) => id));
      if (!result.ok) return setError(result.error);
      setUnowned(null);
      setMessage(`${result.unpublished} product${result.unpublished === 1 ? "" : "en"} offline gehaald${result.failed ? `, ${result.failed} mislukt. Controleer opnieuw.` : "."}`);
    });
  }

  return (
    <>
      <p className="muted">Eenmalig: maak de webshop gelijk aan de app. De app is daarna de enige bron van de webshop.</p>

      <h2 className="shop-reset-heading">Stap 1: advertentieteksten vernieuwen en alles versturen</h2>
      <div className="button-row">
        <button type="button" className="secondary-button" onClick={startReset} disabled={pending}>
          {pending && progress && !stepOneDone ? "Bezig…" : "Stap 1 starten"}
        </button>
        {stepOneDone && failed.length > 0 && (
          <button type="button" className="secondary-button" onClick={retryFailed} disabled={pending}>
            Mislukte opnieuw proberen
          </button>
        )}
      </div>
      {progress && (
        <p role="status" className={stepOneDone && failed.length === 0 ? "field-success" : undefined}>
          {progress.done} van {progress.total} kachels verwerkt{stepOneDone ? (failed.length === 0 ? ". Klaar." : `, ${failed.length} met een fout.`) : "…"}
        </p>
      )}
      {failed.length > 0 && (
        <ul className="shop-reset-issues">
          {failed.map(({ number, reason }) => (
            <li key={number}>
              <strong>{number}</strong>: {reason}
            </li>
          ))}
        </ul>
      )}

      <h2 className="shop-reset-heading">Stap 2: producten offline halen die niet in de app staan</h2>
      <p className="muted">Doe dit pas als stap 1 klaar is, anders lijken nieuwe kachels nog niet in de app te staan.</p>
      <div className="button-row">
        <button type="button" className="secondary-button" onClick={checkUnowned} disabled={pending}>
          Controleren
        </button>
        {unowned && unowned.length > 0 && (
          <button type="button" className="danger-button" onClick={unpublish} disabled={pending}>
            {unowned.length} product{unowned.length === 1 ? "" : "en"} offline halen
          </button>
        )}
      </div>
      {unowned && unowned.length === 0 && <p className="field-success" role="status">Alles wat online staat, staat ook in de app.</p>}
      {unowned && unowned.length > 0 && (
        <ul className="shop-reset-issues" aria-label="Producten die offline gaan">
          {unowned.map(({ id, name, sku }) => (
            <li key={id}>
              {name}
              {sku ? ` (${sku})` : ""}
            </li>
          ))}
        </ul>
      )}
      {message && <p className="field-success" role="status">{message}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}
