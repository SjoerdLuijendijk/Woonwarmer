"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { downloadFile } from "../lib/download-file";
import type { Article } from "../lib/articles";
import { invoiceTotals, type Company, type Invoice } from "../lib/invoice";
import { EMPTY_CUSTOMER, emptyLine, stoveLine, stoveUnits, todayIsoDate, toCustomer, toInvoiceLines, type DraftCustomer, type DraftLine } from "../lib/invoice-draft";
import type { InvoiceStock } from "../lib/invoice-queries";
import type { Stove } from "../lib/stoves";
import CustomerFields from "./CustomerFields";
import { useDialog } from "./DialogProvider";
import { createInvoice, getInvoiceSources } from "./invoice-actions";
import InvoiceLinesEditor from "./InvoiceLinesEditor";
import InvoiceStockOption, { stockDeduction } from "./InvoiceStockOption";
import InvoiceTotalsSummary from "./InvoiceTotalsSummary";

const PREVIEW_DELAY_MS = 400;

// pdf-lib is only loaded once an invoice is opened.
async function renderPdf(invoice: Invoice) {
  const { createInvoicePdf, invoiceFileName } = await import("../lib/invoice-pdf");
  return { bytes: await createInvoicePdf(invoice), fileName: invoiceFileName(invoice) };
}

/** A concept invoice filled in beforehand, for example from an accepted quote. */
export type InvoicePrefill = { customer: DraftCustomer; lines: DraftLine[]; stoveNumber: number | null };

type InvoiceDialogProps = {
  /** Null: a separate invoice, opened with a button on the invoices page. */
  stove: Stove | null;
  /** Loads customer and lines when the dialog opens; the button then reads "Factuur maken". */
  loadPrefill?: () => Promise<InvoicePrefill | null>;
};

export default function InvoiceDialog({ stove, loadPrefill }: InvoiceDialogProps) {
  const [prefillStove, setPrefillStove] = useState<number | null>(null);
  const stoveNumber = stove?.number ?? prefillStove;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [company, setCompany] = useState<Company | null | undefined>(undefined);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [stock, setStock] = useState<InvoiceStock | null>(null);
  const [takeFromStock, setTakeFromStock] = useState(false);
  const [customer, setCustomer] = useState<DraftCustomer>(EMPTY_CUSTOMER);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [created, setCreated] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLineErrors, setShowLineErrors] = useState(false);
  const [pending, startTransition] = useTransition();
  const { confirm } = useDialog();

  const { valid, invalid } = useMemo(() => toInvoiceLines(lines), [lines]);
  const totals = invoiceTotals(valid);
  const units = stoveUnits(lines, stoveNumber);
  const deduction = stockDeduction(stock, units, takeFromStock);

  async function open() {
    const prefill = loadPrefill ? await loadPrefill() : null;
    if (loadPrefill && !prefill) return;
    setCustomer(prefill?.customer ?? EMPTY_CUSTOMER);
    setLines(prefill?.lines ?? [stove ? stoveLine(stove) : emptyLine()]);
    const invoicedStove = stove?.number ?? prefill?.stoveNumber ?? null;
    setPrefillStove(prefill?.stoveNumber ?? null);
    setCreated(null);
    setError(null);
    setShowLineErrors(false);
    setCompany(undefined);
    setArticles(null);
    setStock(null);
    setIsOpen(true);
    dialogRef.current?.showModal();
    getInvoiceSources(invoicedStove).then((result) => {
      if (!result.ok) return setError(result.error);
      setCompany(result.company);
      setArticles(result.articles);
      setStock(result.stock);
      setTakeFromStock(result.stock?.openSales === 0);
    });
  }

  // Live draft preview, rebuilt shortly after the last change.
  useEffect(() => {
    if (!isOpen || !company || created) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const draft: Invoice = { number: null, issueDate: todayIsoDate(), stoveNumber, seller: company, customer: toCustomer(customer), lines: valid };
      const { bytes } = await renderPdf(draft);
      if (cancelled) return;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, company, customer, valid, created, stoveNumber]);

  function handleClose() {
    setIsOpen(false);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }

  async function download(invoice: Invoice) {
    const { bytes, fileName } = await renderPdf(invoice);
    downloadFile(bytes, fileName);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (invalid.length > 0) {
      setShowLineErrors(true);
      setError(`Regel ${invalid[0] + 1} is niet compleet: vul omschrijving, aantal en prijs in.`);
      return;
    }
    if (stock && deduction > stock.quantity) {
      setError(`Er staan maar ${stock.quantity} van kachel ${stoveNumber} op voorraad.`);
      return;
    }
    const stockNote = deduction > 0 ? ` Kachel ${stoveNumber} gaat ${deduction} keer van de voorraad.` : "";
    const confirmed = await confirm({
      title: "Factuur definitief maken?",
      message: `De factuur krijgt een factuurnummer en de datum van vandaag. Klant en regels kun je daarna nog wijzigen in de lijst Facturen.${stockNote}`,
      confirmLabel: "Factuur maken",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await createInvoice(stoveNumber, { customer: toCustomer(customer), lines: valid, stockDeduction: deduction });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.invoice);
      await download(result.invoice);
    });
  }

  const titleId = useId();
  return (
    <>
      {stove ? (
        <button type="button" className="icon-button" onClick={open} title="Factuur maken" aria-label={`Factuur maken voor kachel ${stove.number}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8M8 17h5" />
          </svg>
        </button>
      ) : loadPrefill ? (
        <button type="button" className="invoice-link" onClick={open} title="Conceptfactuur maken van deze offerte">
          Factuur maken
        </button>
      ) : (
        <button type="button" className="sale-button" onClick={open}>
          + Losse factuur
        </button>
      )}
      <dialog ref={dialogRef} className="invoice-dialog" aria-labelledby={titleId} onClose={handleClose}>
        <div className="invoice-dialog-header">
          <h2 id={titleId}>{stove ? `Factuur kachel ${stove.number}` : loadPrefill ? "Factuur van offerte" : "Losse factuur"}</h2>
          <button type="button" className="line-remove" onClick={() => dialogRef.current?.close()} aria-label="Sluiten">×</button>
        </div>

        {created ? (
          <div className="invoice-created" role="status">
            <p className="stove-number-big">{created.number}</p>
            <p>De factuur is gemaakt en gedownload als PDF.</p>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={() => download(created)}>PDF opnieuw downloaden</button>
              <button type="button" className="primary-button" onClick={() => dialogRef.current?.close()}>Sluiten</button>
            </div>
          </div>
        ) : company === null ? (
          <div className="notice">
            <strong>Bedrijfsgegevens ontbreken</strong>
            <p>Vul eerst je bedrijfsgegevens in bij <Link href="/?tab=admin&sectie=bedrijf">Bedrijfsgegevens</Link> (menu rechtsboven); die komen op de factuur.</p>
          </div>
        ) : (
          <div className="invoice-layout">
            <form className="invoice-form" onSubmit={handleCreate}>
              <CustomerFields customer={customer} onChange={setCustomer} />
              <InvoiceLinesEditor
                hourlyRateExCents={company ? (company.hourly_rate_ex_cents ?? null) : undefined}
                lines={lines}
                invalid={showLineErrors ? invalid : []}
                onChange={setLines}
                articles={articles}
                onPick={(line) => setLines((current) => [...current, line])}
              />
              <InvoiceTotalsSummary totals={totals} />
              {stoveNumber !== null && (
                <InvoiceStockOption stoveNumber={stoveNumber} stock={stock} units={units} checked={takeFromStock} onChange={setTakeFromStock} />
              )}
              <div className="dialog-footer">
                <div className="dialog-footer-status">
                  {error && <p className="field-error" role="alert">{error}</p>}
                </div>
                <button className="primary-button" type="submit" disabled={pending || !company}>
                  {pending ? "Factuur maken…" : "Factuur maken (PDF)"}
                </button>
              </div>
            </form>

            <div className="invoice-preview">
              {previewUrl ? (
                <>
                  <iframe src={`${previewUrl}#view=FitH`} title="Voorvertoning van de factuur" />
                  <a className="preview-link" href={previewUrl} target="_blank" rel="noopener noreferrer">Voorvertoning in nieuw tabblad</a>
                </>
              ) : (
                <p className="muted">{company === undefined ? "Voorvertoning laden…" : "Voorvertoning maken…"}</p>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
