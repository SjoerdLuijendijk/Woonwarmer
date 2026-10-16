"use client";

import { useState } from "react";
import type { Article } from "../lib/articles";
import { MAX_INVOICE_LINES, MONTAGE_VAT_RATE, VAT_RATES } from "../lib/invoice";
import { draftVatPatch, draftVatValue, emptyLine, montageLine, type DraftLine } from "../lib/invoice-draft";
import { formatPrice } from "../lib/price";
import type { QuoteStoveOption } from "../lib/quote-queries";
import AddLineMenu, { type AddLineOption } from "./AddLineMenu";
import LineBrowser, { type LineSource } from "./LineBrowser";

type InvoiceLinesEditorProps = {
  lines: DraftLine[];
  invalid: number[];
  onChange: (lines: DraftLine[]) => void;
  /** Articles to pick lines from; null while loading. */
  articles: Article[] | null;
  /** Quotes: stoves to pick lines from. Leave out for invoices. */
  stoves?: QuoteStoveOption[];
  /** Adds a picked stove or article line. Use a state updater: several lines can be picked in a row. */
  onPick: (line: DraftLine) => void;
  /** Quotes: typed lines can be saved in the article list. */
  allowSaveAsArticle?: boolean;
  /** Hourly rate excluding VAT for montage: null when not set (the price stays empty), undefined while loading. */
  hourlyRateExCents?: number | null;
};

function montageDetail(hourlyRateExCents: number | null | undefined) {
  if (hourlyRateExCents == null) return "Per uur; uurtarief nog niet ingesteld";
  return `Per uur, ${formatPrice(Math.round((hourlyRateExCents * (100 + MONTAGE_VAT_RATE)) / 100), { alwaysCents: true })} incl. btw`;
}

// The lines of an invoice or quote as a compact table, with "＋ Nieuwe regel" to add a stove, an
// article, montage or a line typed by hand.
export default function InvoiceLinesEditor({ lines, invalid, onChange, articles, stoves, onPick, allowSaveAsArticle, hourlyRateExCents }: InvoiceLinesEditorProps) {
  const [browsing, setBrowsing] = useState<LineSource | null>(null);
  const full = lines.length >= MAX_INVOICE_LINES;
  const append = (line: DraftLine) => onChange(lines.length >= MAX_INVOICE_LINES ? lines : [...lines, line]);
  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const options: AddLineOption[] = [
    // Stoves and articles load together, so both wait for the articles.
    ...(stoves ? [{ key: "stove", label: "Kachel", detail: articles ? "Uit de voorraad" : "Kachels laden…", disabled: !articles, onSelect: () => setBrowsing("stove") }] : []),
    { key: "article", label: "Artikel", detail: articles ? "Uit de artikellijst" : "Artikelen laden…", disabled: !articles, onSelect: () => setBrowsing("article") },
    { key: "montage", label: "Montage", detail: montageDetail(hourlyRateExCents), onSelect: () => append(montageLine(hourlyRateExCents)) },
    { key: "blank", label: "Losse regel", detail: "Omschrijving en prijs zelf invullen", onSelect: () => append(emptyLine()) },
  ];

  return (
    <fieldset className="invoice-section">
      <legend>Regels</legend>
      <div className="invoice-lines-head" aria-hidden="true">
        <span>Omschrijving</span>
        <span>Aantal</span>
        <span>Prijs incl. btw</span>
        <span>Btw</span>
      </div>
      <ul className="invoice-lines">
        {lines.map((line, index) => (
          <li key={line.key} className={invalid.includes(index) ? "invoice-line is-invalid" : "invoice-line"}>
            <label className="stacked-label line-description">
              <span>Omschrijving</span>
              <input value={line.description} maxLength={200} title={line.description} onChange={(event) => update(line.key, { description: event.target.value })} />
            </label>
            <label className="stacked-label line-quantity">
              <span>Aantal</span>
              <input value={line.quantity} inputMode="numeric" onChange={(event) => update(line.key, { quantity: event.target.value })} />
            </label>
            <label className="stacked-label line-price">
              <span>Prijs incl. btw</span>
              <input value={line.price} inputMode="text" placeholder="bijv. 250" onChange={(event) => update(line.key, { price: event.target.value })} />
            </label>
            <label className="stacked-label line-vat">
              <span>Btw</span>
              <select value={draftVatValue(line)} onChange={(event) => update(line.key, draftVatPatch(event.target.value))}>
                {VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                <option value="margin">Marge</option>
              </select>
            </label>
            <button
              type="button"
              className="line-remove"
              onClick={() => onChange(lines.filter((other) => other.key !== line.key))}
              disabled={lines.length === 1}
              aria-label={`Regel ${index + 1} verwijderen`}
              title="Regel verwijderen"
            >
              ×
            </button>
            {allowSaveAsArticle && !line.articleId && !line.stoveNumber && (
              <label className="line-save">
                <input type="checkbox" checked={line.saveAsArticle ?? false} onChange={(event) => update(line.key, { saveAsArticle: event.target.checked })} />
                Opslaan in artikelen
              </label>
            )}
          </li>
        ))}
      </ul>
      {lines.length === 0 && <p className="muted form-hint">Nog geen regels. Voeg er een toe met ＋ Nieuwe regel.</p>}
      <div className="line-actions">
        <AddLineMenu options={options} disabled={full} />
        <p className="form-hint muted">Gebruikte kachel: btw „Marge”. Inruilkachel: minbedrag, bijv. -100.</p>
      </div>
      {browsing && (
        <LineBrowser
          source={browsing}
          stoves={stoves}
          articles={articles ?? []}
          onPick={onPick}
          onClose={() => setBrowsing(null)}
        />
      )}
    </fieldset>
  );
}
