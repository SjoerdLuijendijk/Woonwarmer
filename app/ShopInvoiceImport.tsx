"use client";

import { useState, useTransition } from "react";
import { useDialog } from "./DialogProvider";
import { importShopInvoices, type ShopImportReport } from "./payment-actions";

// Instellingen → Catalogus importeren → "Webshopfacturen 2026 ophalen": imports the invoices the web shop
// made before the app took over invoicing. Running it again adds nothing twice and lists, per skipped
// invoice number, why it was left out.
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
    <div className="catalog-import">
      <h2>Webshopfacturen</h2>
      <p className="muted">
        Haalt de facturen van 2026 uit de webshop op (met hun eigen nummer), zodat alle facturen in één lijst staan. Opnieuw
        ophalen voegt niets dubbel toe en laat zien welke nummers zijn overgeslagen en waarom.
      </p>
      <button type="button" className="secondary-button" onClick={handleImport} disabled={pending}>
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
    </div>
  );
}
