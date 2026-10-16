"use client";

import { useState, useTransition } from "react";
import { useDialog } from "./DialogProvider";
import { importShopInvoices, type ShopImportReport } from "./payment-actions";

// Facturen → "Webshopfacturen 2026 ophalen": a one-off import of the invoices the web shop made before
// the app took over invoicing. Shown until they are in the app.
export default function ShopInvoiceImport() {
  const [report, setReport] = useState<ShopImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm } = useDialog();

  async function handleImport() {
    const confirmed = await confirm({
      title: "Webshopfacturen van 2026 ophalen?",
      message: "De facturen uit WooCommerce komen met hun eigen nummer in deze lijst. Wat in de webshop al betaald is, staat meteen op betaald. Dit kan een minuut duren.",
      confirmLabel: "Ophalen",
    });
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await importShopInvoices();
      if (result.ok) setReport(result.report);
      else setError(result.error);
    });
  }

  return (
    <>
      <button type="button" className="secondary-button toolbar-button" onClick={handleImport} disabled={pending}>
        {pending ? "Ophalen…" : "Webshopfacturen 2026 ophalen"}
      </button>
      {(report || error) && (
        <div className="notice import-report" role="status">
          {error ? (
            <p className="field-error">{error}</p>
          ) : (
            report && (
              <>
                <p>
                  <strong>Klaar:</strong> {report.imported} webshopfacturen opgehaald
                  {report.existing > 0 && `, ${report.existing} stonden er al`}
                  {report.skipped.length > 0 && `, ${report.skipped.length} overgeslagen`}.
                </p>
                <p className="muted">
                  {report.orders} bestellingen bekeken; {report.withoutNumber} zonder factuurnummer.
                </p>
                {report.skipped.length > 0 && (
                  <ul>
                    {report.skipped.map(({ orderId, number, reason }) => (
                      <li key={orderId}>
                        Factuur {number ?? "—"} (bestelling {orderId}): {reason}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          )}
          <button type="button" className="text-button" onClick={() => { setReport(null); setError(null); }}>Sluiten</button>
        </div>
      )}
    </>
  );
}
