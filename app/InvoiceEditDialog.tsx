"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Article } from "../lib/articles";
import { downloadFile } from "../lib/download-file";
import { invoiceTotals, type Customer, type Invoice } from "../lib/invoice";
import { addDraftLine, invoiceStoveNumber, stoveUnits, toCustomer, toInvoiceLines, type DraftCustomer, type DraftLine } from "../lib/invoice-draft";
import type { InvoiceStock } from "../lib/invoice-queries";
import { formatPriceInput } from "../lib/price";
import CustomerFields from "./CustomerFields";
import { useDialog } from "./DialogProvider";
import { deleteDraftInvoice, finalizeInvoice, getInvoiceSources, getStoveStockForInvoice, saveDraftInvoice } from "./invoice-actions";
import InvoiceLinesEditor from "./InvoiceLinesEditor";
import InvoiceStockOption, { stockDeduction } from "./InvoiceStockOption";
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

// Shows an invoice with its PDF. A concept can still change: it is saved, made final (marked sent,
// which gives it its number and date) or deleted. A sent invoice is final and only shown. Rendered
// only while open.
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
  const [stock, setStock] = useState<InvoiceStock | null>(null);
  const [takeFromStock, setTakeFromStock] = useState(false);
  const { confirm } = useDialog();
  const isDraft = saved.status === "draft";

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
  const previewUrl = usePdfPreview(useCallback(async () => (await renderPdf(isDraft ? draft : saved)).bytes, [isDraft, draft, saved]));
  // A concept is about the one stove on its lines (or the stove it was made for).
  const stoveNumber = isDraft ? (invoiceStoveNumber(lines) ?? saved.stoveNumber) : saved.stoveNumber;
  const units = stoveUnits(lines, stoveNumber);
  const deduction = stockDeduction(stock, units, takeFromStock);

  // The stock of the concept's stove, for "van de voorraad afhalen" when it is made final.
  useEffect(() => {
    setStock(null);
    if (!isDraft || stoveNumber === null) return;
    let cancelled = false;
    getStoveStockForInvoice(stoveNumber).then((result) => {
      if (cancelled || !result.ok) return;
      setStock(result.stock);
      setTakeFromStock(result.stock?.openSales === 0);
    });
    return () => {
      cancelled = true;
    };
  }, [isDraft, stoveNumber]);
  // The download is the saved invoice, so it only matches the form once changes are saved.
  const unsaved =
    JSON.stringify([draft.customer, storedLines(draft.lines), invalid]) !== JSON.stringify([saved.customer, storedLines(saved.lines), []]);

  function linesComplete() {
    setError(null);
    setMessage(null);
    if (lines.length === 0) {
      setError("Een factuur heeft minstens één regel.");
      return false;
    }
    if (invalid.length > 0) {
      setShowLineErrors(true);
      setError(`Regel ${invalid[0] + 1} is niet compleet: vul omschrijving, aantal en prijs in.`);
      return false;
    }
    return true;
  }

  const saveDraft = () => saveDraftInvoice(invoiceId, stoveNumber, { customer: toCustomer(customer), lines: valid });

  function handleSave() {
    if (!linesComplete()) return;
    startTransition(async () => {
      const result = await saveDraft();
      if (!result.ok) return setError(result.error);
      setSaved(result.invoice);
      setShowLineErrors(false);
      setMessage("Concept opgeslagen.");
    });
  }

  async function handleFinalize(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linesComplete()) return;
    if (stock && deduction > stock.quantity) return setError(`Er staan maar ${stock.quantity} van kachel ${stoveNumber} op voorraad.`);
    const stockNote = deduction > 0 ? ` Kachel ${stoveNumber} gaat ${deduction} keer van de voorraad.` : "";
    const confirmed = await confirm({
      title: "Factuur definitief maken?",
      message: `De factuur krijgt een factuurnummer en de datum van vandaag en staat daarna op verstuurd. Hij kan dan niet meer worden gewijzigd.${stockNote}`,
      confirmLabel: "Definitief maken",
    });
    if (!confirmed) return;
    startTransition(async () => {
      if (unsaved) {
        const savedDraft = await saveDraft();
        if (!savedDraft.ok) return setError(savedDraft.error);
      }
      const result = await finalizeInvoice(invoiceId, deduction);
      if (!result.ok) return setError(result.error);
      setSaved(result.invoice);
      setMessage(`Factuur ${result.invoice.number} is definitief en staat op verstuurd.`);
      const { bytes, fileName } = await renderPdf(result.invoice);
      downloadFile(bytes, fileName);
    });
  }

  async function handleDelete() {
    const confirmed = await confirm({ title: "Concept verwijderen?", confirmLabel: "Verwijderen", danger: true });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteDraftInvoice(invoiceId);
      if (!result.ok) return setError(result.error);
      dialogRef.current?.close();
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
            {isDraft ? "Conceptfactuur" : `Factuur ${saved.number}`}
          </h2>
          <p className="dialog-subtitle">
            {isDraft ? "Nog niet verstuurd" : `Verstuurd · ${DATE_FORMAT.format(new Date(saved.issueDate))}`}
            {stoveNumber !== null && <> · Kachel {stoveNumber}</>}
          </p>
        </div>
        <button type="button" className="line-remove" onClick={() => dialogRef.current?.close()} aria-label="Sluiten">×</button>
      </div>

      <div className="invoice-layout">
        <form className="invoice-form" onSubmit={handleFinalize}>
          {!isDraft && <p className="notice invoice-final-note">Deze factuur is verstuurd en kan niet meer worden gewijzigd.</p>}
          {/* A sent invoice is shown with the same fields, all switched off. */}
          <fieldset className="invoice-fieldset" disabled={!isDraft}>
            <CustomerFields customer={customer} onChange={setCustomer} />
            <InvoiceLinesEditor
              hourlyRateExCents={saved.seller.hourly_rate_ex_cents ?? null}
              lines={lines}
              invalid={showLineErrors ? invalid : []}
              onChange={setLines}
              articles={articles}
              onPick={(line) => setLines((current) => addDraftLine(current, line))}
            />
          </fieldset>
          <InvoiceTotalsSummary totals={totals} />
          {isDraft && stoveNumber !== null && (
            <InvoiceStockOption stoveNumber={stoveNumber} stock={stock} units={units} checked={takeFromStock} onChange={setTakeFromStock} />
          )}
          <div className="dialog-footer">
            <div className="dialog-footer-status">
              {error && <p className="field-error" role="alert">{error}</p>}
              {message && !unsaved && <p className="field-success" role="status">{message}</p>}
              {isDraft && unsaved && !error && <p className="muted">Niet-opgeslagen wijzigingen</p>}
            </div>
            {isDraft ? (
              <>
                <button type="button" className="text-button danger-text" onClick={handleDelete} disabled={pending}>
                  Verwijderen
                </button>
                <button type="button" className="secondary-button" onClick={handleSave} disabled={pending || !unsaved}>
                  Concept opslaan
                </button>
                <button className="primary-button" type="submit" disabled={pending}>
                  {pending ? "Bezig…" : "Definitief maken"}
                </button>
              </>
            ) : (
              <button type="button" className="primary-button" onClick={download} disabled={pending}>
                PDF downloaden
              </button>
            )}
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
