"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Article } from "../lib/articles";
import { downloadFile } from "../lib/download-file";
import { invoiceTotals, type Customer, type Invoice } from "../lib/invoice";
import { toCustomer, toInvoiceLines, type DraftCustomer, type DraftLine } from "../lib/invoice-draft";
import { formatPriceInput } from "../lib/price";
import CustomerFields from "./CustomerFields";
import { getInvoiceSources, updateInvoice } from "./invoice-actions";
import InvoiceLinesEditor from "./InvoiceLinesEditor";
import InvoiceTotalsSummary from "./InvoiceTotalsSummary";
import { useLineImages, withLineImages } from "./useLineImages";
import { usePdfPreview } from "./usePdfPreview";

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const toDraftCustomer = (customer: Customer): DraftCustomer => ({
  ...customer,
  email: customer.email ?? "",
  phone: customer.phone ?? "",
});

let keyCounter = 0;
const toDraftLines = (invoice: Invoice): DraftLine[] =>
  invoice.lines.map((line) => ({
    key: `invoice-line-${(keyCounter += 1)}`,
    description: line.description,
    quantity: String(line.quantity),
    price: formatPriceInput(line.unit_price_cents),
    vatRate: line.vat_rate,
    marginScheme: line.margin_scheme,
    stoveNumber: line.stove_number ?? null,
    articleId: line.article_id ?? null,
  }));

// What is stored of a line: the photo is only looked up for the PDF.
const storedLines = (lines: Invoice["lines"]) => lines.map(({ image_url: _image, ...line }) => line);

// pdf-lib is only loaded once an invoice is opened.
async function renderPdf(invoice: Invoice) {
  const { createInvoicePdf, invoiceFileName } = await import("../lib/invoice-pdf");
  return { bytes: await createInvoicePdf(invoice), fileName: invoiceFileName(invoice) };
}

type InvoiceEditDialogProps = {
  invoiceId: number;
  invoice: Invoice;
  onClose: () => void;
};

// Shows an existing invoice with its PDF and lets the team correct the customer and the lines. The
// number, date and seller details stay as created. Rendered only while open.
export default function InvoiceEditDialog({ invoiceId, invoice: initialInvoice, onClose }: InvoiceEditDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [saved, setSaved] = useState<Invoice>(initialInvoice);
  const [customer, setCustomer] = useState<DraftCustomer>(toDraftCustomer(initialInvoice.customer));
  const [lines, setLines] = useState<DraftLine[]>(toDraftLines(initialInvoice));
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLineErrors, setShowLineErrors] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    titleRef.current?.focus({ preventScroll: true });
    getInvoiceSources().then((result) => {
      if (result.ok) setArticles(result.articles);
      else setError(result.error);
    });
  }, []);

  const { valid, invalid } = useMemo(() => toInvoiceLines(lines), [lines]);
  const totals = invoiceTotals(valid);
  const lineImages = useLineImages(valid);
  const draft = useMemo<Invoice>(
    () => ({ ...saved, customer: toCustomer(customer), lines: withLineImages(valid, lineImages) }),
    [saved, customer, valid, lineImages],
  );
  const previewUrl = usePdfPreview(useCallback(async () => (await renderPdf(draft)).bytes, [draft]));
  // The download is the saved invoice, so it only matches the form once changes are saved.
  const unsaved =
    JSON.stringify([draft.customer, storedLines(draft.lines), invalid]) !== JSON.stringify([saved.customer, storedLines(saved.lines), []]);

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (lines.length === 0) return setError("Een factuur heeft minstens één regel.");
    if (invalid.length > 0) {
      setShowLineErrors(true);
      return setError(`Regel ${invalid[0] + 1} is niet compleet: vul omschrijving, aantal en prijs in.`);
    }
    startTransition(async () => {
      const result = await updateInvoice(invoiceId, { customer: toCustomer(customer), lines: valid });
      if (!result.ok) return setError(result.error);
      setSaved(result.invoice);
      setShowLineErrors(false);
      setMessage(`Factuur ${result.invoice.number} is opgeslagen.`);
    });
  }

  async function download() {
    const { bytes, fileName } = await renderPdf(saved);
    downloadFile(bytes, fileName);
  }

  return (
    <dialog
      ref={dialogRef}
      className="invoice-dialog"
      aria-labelledby="invoice-edit-title"
      // React passes the close event of the nested pick list ("Klaar") on to this dialog; only react
      // to this dialog closing itself.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="invoice-dialog-header">
        <div>
          <h2 id="invoice-edit-title" ref={titleRef} tabIndex={-1} className="dialog-title">
            Factuur {saved.number}
          </h2>
          <p className="dialog-subtitle">
            {DATE_FORMAT.format(new Date(saved.issueDate))}
            {saved.stoveNumber !== null && <> · Kachel {saved.stoveNumber}</>}
          </p>
        </div>
        <button type="button" className="line-remove" onClick={() => dialogRef.current?.close()} aria-label="Sluiten">×</button>
      </div>

      <div className="invoice-layout">
        <form className="invoice-form" onSubmit={handleSave}>
          <CustomerFields customer={customer} onChange={setCustomer} />
          <InvoiceLinesEditor
            hourlyRateExCents={saved.seller.hourly_rate_ex_cents ?? null}
            lines={lines}
            invalid={showLineErrors ? invalid : []}
            onChange={setLines}
            articles={articles}
            onPick={(line) => setLines((current) => [...current, line])}
          />
          <InvoiceTotalsSummary totals={totals} />
          {saved.stoveNumber !== null && (
            <p className="form-hint muted">Een wijziging past de voorraad van kachel {saved.stoveNumber} niet aan.</p>
          )}
          <div className="dialog-footer">
            <div className="dialog-footer-status">
              {error && <p className="field-error" role="alert">{error}</p>}
              {message && !unsaved && <p className="field-success" role="status">{message}</p>}
              {unsaved && !error && <p className="muted">Niet-opgeslagen wijzigingen</p>}
            </div>
            <button type="button" className="secondary-button" onClick={download} disabled={pending || unsaved} title={unsaved ? "Sla eerst de wijzigingen op" : undefined}>
              PDF downloaden
            </button>
            <button className="primary-button" type="submit" disabled={pending || !unsaved}>
              {pending ? "Opslaan…" : "Opslaan"}
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
            <p className="muted">Voorvertoning maken…</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
