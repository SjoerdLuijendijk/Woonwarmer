"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Article } from "../lib/articles";
import { downloadFile } from "../lib/download-file";
import { invoiceTotals, MAX_QUANTITY, type Company } from "../lib/invoice";
import { addDraftLine, draftLineVat, EMPTY_CUSTOMER, toInvoiceLines, type DraftCustomer, type DraftLine } from "../lib/invoice-draft";
import { formatPriceInput, parsePriceToCents } from "../lib/price";
import { DEFAULT_VALID_DAYS, MAX_NOTES_LENGTH, type Quote, type QuoteCustomer, type QuoteLine } from "../lib/quote";
import type { QuoteStoveOption } from "../lib/quote-queries";
import { todayInNetherlands } from "../lib/today";
import CustomerFields from "./CustomerFields";
import InvoiceLinesEditor from "./InvoiceLinesEditor";
import InvoiceTotalsSummary from "./InvoiceTotalsSummary";
import { getQuoteSources, saveQuote } from "./quote-actions";
import { useLineImages, withLineImages } from "./useLineImages";

const PREVIEW_DELAY_MS = 400;

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const toDraftCustomer = (customer: QuoteCustomer): DraftCustomer => ({
  name: customer.name,
  address: customer.address ?? "",
  postal_code: customer.postalCode ?? "",
  city: customer.city ?? "",
  email: customer.email ?? "",
  phone: customer.phone ?? "",
});

const toQuoteCustomer = (draft: DraftCustomer): QuoteCustomer => ({
  name: draft.name.trim(),
  address: draft.address.trim() || null,
  postalCode: draft.postal_code.trim() || null,
  city: draft.city.trim() || null,
  email: draft.email.trim() || null,
  phone: draft.phone.trim() || null,
});

let keyCounter = 0;
const toDraftLines = (quote: Quote): DraftLine[] =>
  quote.lines.map((line) => ({
    key: `quote-line-${(keyCounter += 1)}`,
    description: line.description,
    quantity: String(line.quantity),
    price: formatPriceInput(line.unit_price_cents),
    vatRate: line.vat_rate,
    marginScheme: line.margin_scheme,
    stoveNumber: line.stove_number,
    articleId: line.article_id,
  }));

// Every line with a description shows in the preview, also while its price or quantity is missing
// (as 0 and 1), so a picked article without a price is visible straight away. Saving still requires
// complete lines.
function previewLines(lines: DraftLine[]): QuoteLine[] {
  return lines
    .filter((line) => line.description.trim())
    .map((line) => {
      const quantity = Number.parseInt(line.quantity, 10);
      return {
        description: line.description.trim(),
        quantity: Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : 1,
        unit_price_cents: parsePriceToCents(line.price, { allowNegative: true }) ?? 0,
        ...draftLineVat(line),
        stove_number: line.stoveNumber ?? null,
        article_id: line.articleId ?? null,
      };
    });
}

// pdf-lib is only loaded once a quote is opened.
async function renderPdf(quote: Quote, company: Company) {
  const { createQuotePdf, quoteFileName } = await import("../lib/invoice-pdf");
  return { bytes: await createQuotePdf(quote, company), fileName: quoteFileName(quote) };
}

type QuoteDialogProps = {
  /** Null for a new quote. */
  quote: Quote | null;
  onClose: () => void;
};

// Creates or edits a quote: customer, lines from stoves, articles or typed by hand, validity and
// notes, with a live PDF preview. Rendered only while open.
export default function QuoteDialog({ quote: initialQuote, onClose }: QuoteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const today = todayInNetherlands();
  const [saved, setSaved] = useState<Quote | null>(initialQuote);
  const [customer, setCustomer] = useState<DraftCustomer>(initialQuote ? toDraftCustomer(initialQuote.customer) : EMPTY_CUSTOMER);
  const [lines, setLines] = useState<DraftLine[]>(initialQuote ? toDraftLines(initialQuote) : []);
  const [validUntil, setValidUntil] = useState(initialQuote?.validUntil ?? addDays(today, DEFAULT_VALID_DAYS));
  const [notes, setNotes] = useState(initialQuote?.notes ?? "");
  const [sources, setSources] = useState<{ company: Company | null; stoves: QuoteStoveOption[]; articles: Article[] } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLineErrors, setShowLineErrors] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    titleRef.current?.focus({ preventScroll: true });
    getQuoteSources().then((result) => {
      if (result.ok) setSources({ company: result.company, stoves: result.stoves, articles: result.articles });
      else setError(result.error);
    });
  }, []);

  const { valid, invalid } = useMemo(() => toInvoiceLines(lines), [lines]);
  const totals = invoiceTotals(valid);
  const company = sources?.company;
  const quoteLines = useMemo(() => previewLines(lines), [lines]);
  const lineImages = useLineImages(quoteLines);

  const draftQuote = useMemo<Quote>(
    () => ({
      id: saved?.id ?? null,
      number: saved?.number ?? null,
      status: saved?.status ?? "draft",
      issueDate: saved?.issueDate ?? today,
      validUntil,
      customer: toQuoteCustomer(customer),
      notes: notes.trim() || null,
      lines: withLineImages(quoteLines, lineImages),
    }),
    [saved, today, validUntil, customer, notes, quoteLines, lineImages],
  );

  // Live preview, rebuilt shortly after the last change.
  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { bytes } = await renderPdf(draftQuote, company);
      if (cancelled) return;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftQuote, company]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (lines.length === 0) return setError("Voeg minstens één regel toe.");
    if (invalid.length > 0) {
      setShowLineErrors(true);
      return setError(`Regel ${invalid[0] + 1} is niet compleet: vul omschrijving, aantal en prijs in.`);
    }
    const input = {
      customer: toQuoteCustomer(customer),
      validUntil,
      notes,
      lines: valid.map((line, index) => ({
        ...line,
        stove_number: lines[index].stoveNumber ?? null,
        article_id: lines[index].articleId ?? null,
        save_as_article: lines[index].saveAsArticle ?? false,
      })),
    };
    startTransition(async () => {
      const result = await saveQuote(saved?.id ?? null, input);
      if (!result.ok) return setError(result.error);
      setSaved(result.quote);
      // Lines saved as article are now linked to it.
      setLines(toDraftLines(result.quote));
      setMessage(`Offerte ${result.quote.number} is opgeslagen.`);
    });
  }

  async function download() {
    if (!saved || !company) return;
    const { bytes, fileName } = await renderPdf({ ...draftQuote, number: saved.number }, company);
    downloadFile(bytes, fileName);
  }

  // Picking the same article or stove again raises the quantity of its line instead of adding one.
  const addLine = (line: DraftLine) =>
    setLines((current) => {
      const same = current.find(
        (other) => (line.articleId != null && other.articleId === line.articleId) || (line.stoveNumber != null && other.stoveNumber === line.stoveNumber),
      );
      if (same) {
        const quantity = Number.parseInt(same.quantity, 10);
        const next = Math.min(MAX_QUANTITY, (Number.isInteger(quantity) && quantity > 0 ? quantity : 0) + 1);
        return current.map((other) => (other === same ? { ...other, quantity: String(next) } : other));
      }
      return addDraftLine(current, line);
    });

  return (
    <dialog
      ref={dialogRef}
      className="invoice-dialog"
      aria-labelledby="quote-title"
      // React passes the close event of the nested pick list ("Klaar") on to this dialog; only react
      // to this dialog closing itself.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="invoice-dialog-header">
        <h2 id="quote-title" ref={titleRef} tabIndex={-1} className="dialog-title">
          {saved?.number ? `Offerte ${saved.number}` : "Nieuwe offerte"}
        </h2>
        <button type="button" className="line-remove" onClick={() => dialogRef.current?.close()} aria-label="Sluiten">×</button>
      </div>

      {company === null ? (
        <div className="notice">
          <strong>Bedrijfsgegevens ontbreken</strong>
          <p>Vul eerst je bedrijfsgegevens in bij <Link href="/?tab=admin&sectie=bedrijf">Instellingen → Bedrijfsgegevens</Link>; die komen op de offerte.</p>
        </div>
      ) : (
        <div className="invoice-layout">
          <form className="invoice-form" onSubmit={handleSave}>
            <CustomerFields customer={customer} onChange={setCustomer} addressOptional />
            <InvoiceLinesEditor
              hourlyRateExCents={company ? (company.hourly_rate_ex_cents ?? null) : undefined}
              lines={lines}
              invalid={showLineErrors ? invalid : []}
              onChange={setLines}
              articles={sources?.articles ?? null}
              stoves={sources?.stoves ?? []}
              onPick={addLine}
              allowSaveAsArticle
            />
            <fieldset className="invoice-section">
              <legend>Voorwaarden</legend>
              <label className="stacked-label">
                <span>Geldig tot</span>
                <input type="date" min={today} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} required />
              </label>
              <label className="stacked-label">
                <span>Opmerking op de offerte (optioneel)</span>
                <textarea rows={3} maxLength={MAX_NOTES_LENGTH} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </fieldset>
            <InvoiceTotalsSummary totals={totals} />
            <div className="dialog-footer">
              <div className="dialog-footer-status">
                {error && <p className="field-error" role="alert">{error}</p>}
                {message && <p className="field-success" role="status">{message}</p>}
              </div>
              {saved && (
                <button type="button" className="secondary-button" onClick={download} disabled={pending || !company}>
                  PDF downloaden
                </button>
              )}
              <button className="primary-button" type="submit" disabled={pending || !sources}>
                {pending ? "Opslaan…" : saved ? "Wijzigingen opslaan" : "Offerte opslaan"}
              </button>
            </div>
          </form>

          <div className="invoice-preview">
            {previewUrl ? (
              <>
                <iframe src={`${previewUrl}#view=FitH`} title="Voorvertoning van de offerte" />
                <a className="preview-link" href={previewUrl} target="_blank" rel="noopener noreferrer">Voorvertoning in nieuw tabblad</a>
              </>
            ) : (
              <p className="muted">{sources ? "Voorvertoning maken…" : "Laden…"}</p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
