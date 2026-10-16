"use client";

import { useState, useTransition } from "react";
import { downloadFile } from "../lib/download-file";
import type { Company } from "../lib/invoice";
import { formatPriceInput, formatPrice } from "../lib/price";
import { QUOTE_STATUS_LABELS, type Quote, type QuoteStatus, type QuoteSummary } from "../lib/quote";
import { onRowClick } from "../lib/row-click";
import { useDialog } from "./DialogProvider";
import InvoiceDialog, { type InvoicePrefill } from "./InvoiceDialog";
import { deleteQuote, getQuoteForPdf, setQuoteStatus } from "./quote-actions";
import QuoteDialog from "./QuoteDialog";
import StatusMenu, { type StatusTone } from "./StatusMenu";

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (isoDate: string) => DATE_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));

const STATUS_TONES: Record<QuoteStatus, StatusTone> = { draft: "cancelled", sent: "negotiating", accepted: "available", rejected: "sold" };

// Customer and lines of a quote as a concept invoice; the address still has to be complete there.
// The invoice is about the one stove on the lines (with several stoves it is a separate invoice).
function invoicePrefill(quote: Quote): InvoicePrefill {
  return {
    customer: {
      name: quote.customer.name,
      address: quote.customer.address ?? "",
      postal_code: quote.customer.postalCode ?? "",
      city: quote.customer.city ?? "",
      email: quote.customer.email ?? "",
      phone: quote.customer.phone ?? "",
    },
    lines: quote.lines.map((line, index) => ({
      key: `quote-${quote.id}-${index}`,
      description: line.description,
      quantity: String(line.quantity),
      price: formatPriceInput(line.unit_price_cents),
      vatRate: line.vat_rate,
      marginScheme: line.margin_scheme,
      stoveNumber: line.stove_number,
    })),
  };
}

// Account menu → Offertes: all quotes in the stock table layout.
export default function QuoteList({ quotes }: { quotes: QuoteSummary[] }) {
  const [editing, setEditing] = useState<{ quote: Quote | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useDialog();

  function load(id: number, then: (quote: Quote, company: Company | null) => void | Promise<void>) {
    startTransition(async () => {
      const result = await getQuoteForPdf(id);
      if (!result.ok) return notify(result.error);
      await then(result.quote, result.company);
    });
  }

  const open = (id: number) => load(id, (quote) => setEditing({ quote }));

  const download = (id: number) =>
    load(id, async (quote, company) => {
      if (!company) return notify("Vul eerst je bedrijfsgegevens in via Instellingen → Bedrijfsgegevens.");
      const { createQuotePdf, quoteFileName } = await import("../lib/invoice-pdf");
      downloadFile(await createQuotePdf(quote, company), quoteFileName(quote));
    });

  async function loadPrefill(id: number) {
    const result = await getQuoteForPdf(id);
    if (!result.ok) {
      await notify(result.error);
      return null;
    }
    return invoicePrefill(result.quote);
  }

  function changeStatus(quote: QuoteSummary, status: QuoteStatus) {
    startTransition(async () => {
      const result = await setQuoteStatus(quote.id, status);
      if (!result.ok) await notify(result.error);
    });
  }

  async function remove(quote: QuoteSummary) {
    const confirmed = await confirm({ title: `Offerte ${quote.number} verwijderen?`, confirmLabel: "Verwijderen", danger: true });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteQuote(quote.id);
      if (!result.ok) await notify(result.error);
    });
  }

  return (
    <section aria-labelledby="quotes-title">
      <div className="stock-toolbar">
        <div className="stock-title-row">
          <h1 id="quotes-title">Offertes</h1>
          <button type="button" className="sale-button" onClick={() => setEditing({ quote: null })}>+ Nieuwe offerte</button>
        </div>
      </div>

      {quotes.length === 0 ? (
        <div className="notice"><p>Er zijn nog geen offertes.</p></div>
      ) : (
        <div className="table-wrap" aria-busy={pending}>
          <table className="stove-table invoice-table">
            <thead>
              <tr>
                <th scope="col">Offerte</th>
                <th scope="col">Datum</th>
                <th scope="col">Klant</th>
                <th scope="col">Omschrijving</th>
                <th scope="col" className="cell-numeric">Bedrag</th>
                <th scope="col">Geldig tot</th>
                <th scope="col">Status</th>
                <th scope="col" className="cell-actions"><span className="visually-hidden">Acties</span></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id} className="clickable-row" onClick={onRowClick(() => open(quote.id))}>
                  <td data-label="Offerte" className="cell-number">{quote.number}</td>
                  <td data-label="Datum" className="cell-nowrap">{formatDate(quote.issueDate)}</td>
                  <td data-label="Klant" className="cell-brand">{quote.customerName}</td>
                  <td data-label="Omschrijving" className="cell-wrap">{quote.subject}</td>
                  <td data-label="Bedrag" className="cell-numeric cell-nowrap">{formatPrice(quote.totalCents, { alwaysCents: true })}</td>
                  <td data-label="Geldig tot" className="cell-nowrap">{formatDate(quote.validUntil)}</td>
                  <td data-label="Status">
                    <StatusMenu
                      label={QUOTE_STATUS_LABELS[quote.status]}
                      tone={STATUS_TONES[quote.status]}
                      ariaLabel={`Offerte ${quote.number}`}
                      disabled={pending}
                      compact
                      options={(Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map((status) => ({
                        key: status,
                        label: QUOTE_STATUS_LABELS[status],
                        tone: STATUS_TONES[status],
                        current: quote.status === status,
                        onSelect: () => changeStatus(quote, status),
                      }))}
                    />
                  </td>
                  <td className="cell-actions cell-nowrap">
                    <span className="invoice-links">
                      <button type="button" className="invoice-link" onClick={() => download(quote.id)} disabled={pending} aria-label={`Offerte ${quote.number} downloaden`}>
                        ↓ PDF
                      </button>
                      {quote.status === "accepted" && <InvoiceDialog stove={null} loadPrefill={() => loadPrefill(quote.id)} />}
                      <button type="button" className="icon-button icon-button--danger" onClick={() => remove(quote)} title="Verwijderen" aria-label={`Offerte ${quote.number} verwijderen`}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <QuoteDialog quote={editing.quote} onClose={() => setEditing(null)} />}
    </section>
  );
}
