"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";

// Shown when a page or a save action fails unexpectedly. A page left open during a release calls
// save actions that the new version no longer knows; only a reload fixes that.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const outdated = unstable_isUnrecognizedActionError(error);

  return (
    <main className="page-main">
      <section className="panel" role="alert" aria-labelledby="error-title">
        <h1 id="error-title">{outdated ? "De app is bijgewerkt" : "Er ging iets mis"}</h1>
        <p className="muted">
          {outdated
            ? "Deze pagina is van een oudere versie, daarom is je wijziging niet opgeslagen. Herlaad de pagina en probeer het opnieuw."
            : "Probeer het opnieuw. Lukt het dan nog niet, herlaad de pagina."}
        </p>
        <div className="button-row">
          {outdated ? (
            <button className="primary-button" type="button" onClick={() => window.location.reload()}>Pagina herladen</button>
          ) : (
            <button className="primary-button" type="button" onClick={() => retry()}>Opnieuw proberen</button>
          )}
        </div>
      </section>
    </main>
  );
}
