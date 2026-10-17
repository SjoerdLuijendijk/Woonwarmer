"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Article } from "../lib/articles";
import { VAT_RATES } from "../lib/invoice";
import { formatPriceInput } from "../lib/price";
import { saveArticle } from "./article-actions";

const TEXT_FIELDS: { name: keyof Article; label: string; maxLength: number; wide?: boolean }[] = [
  { name: "name", label: "Naam", maxLength: 200, wide: true },
  { name: "category", label: "Categorie", maxLength: 100 },
  { name: "brand", label: "Merk", maxLength: 100 },
  { name: "supplier", label: "Leverancier", maxLength: 200 },
  { name: "color", label: "Kleur", maxLength: 100 },
  { name: "material", label: "Materiaal", maxLength: 100 },
  { name: "wallType", label: "Wandtype", maxLength: 100 },
  { name: "unit", label: "Eenheid", maxLength: 40 },
  { name: "ean", label: "EAN", maxLength: 40 },
];

const price = (cents: number | null) => (cents === null ? "" : formatPriceInput(cents));

type ArticleDialogProps = {
  /** Null for a new article. */
  article: Article | null;
  categories: string[];
  /** Markup that gives an article without a sale price its price. */
  markupPct: number;
  onClose: () => void;
};

// Adds or edits an article. Only the name is required. Rendered only while open.
export default function ArticleDialog({ article, categories, markupPct, onClose }: ArticleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The photo follows the web address field; a broken address hides it until the address changes.
  const [imageUrl, setImageUrl] = useState(article?.imageUrl ?? "");
  const [brokenImageUrl, setBrokenImageUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await saveArticle(article?.id ?? null, formData);
      if (result.ok) dialogRef.current?.close();
      else setError(result.error);
    });
  }

  const listId = `article-categories-${article?.id ?? "new"}`;
  return (
    <dialog ref={dialogRef} className="edit-dialog note-dialog" aria-labelledby="article-title" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <h2 id="article-title" ref={titleRef} tabIndex={-1} className="dialog-title">
          {article ? "Artikel bewerken" : "Nieuw artikel"}
        </h2>
        {imageUrl && imageUrl !== brokenImageUrl && (
          <img className="article-dialog-photo" src={imageUrl} alt={article?.name ?? "Artikelfoto"} onError={() => setBrokenImageUrl(imageUrl)} />
        )}
        {/* The article number is only the key for the CSV import and is not shown. */}
        <input type="hidden" name="sku" value={article?.sku ?? ""} />
        <fieldset className="invoice-section">
          <div className="customer-grid">
            {TEXT_FIELDS.map((field) => (
              <label key={field.name} className={field.wide ? "stacked-label customer-wide" : "stacked-label"}>
                <span>{field.label}{field.name === "name" ? "" : " (optioneel)"}</span>
                <input
                  name={field.name}
                  maxLength={field.maxLength}
                  required={field.name === "name"}
                  list={field.name === "category" ? listId : undefined}
                  defaultValue={(article?.[field.name] as string | null) ?? ""}
                />
              </label>
            ))}
            <datalist id={listId}>
              {categories.map((category) => <option key={category} value={category} />)}
            </datalist>
            <label className="stacked-label">
              <span>Diameter (mm)</span>
              <input name="diameterMm" maxLength={9} placeholder="bijv. 150 of 120>130" defaultValue={article?.diameterMm ?? ""} />
            </label>
            <label className="stacked-label">
              <span>Lengte (mm)</span>
              <input name="lengthMm" inputMode="numeric" defaultValue={article?.lengthMm ?? ""} />
            </label>
          </div>
        </fieldset>
        <fieldset className="invoice-section">
          <legend>Prijs</legend>
          <div className="customer-grid">
            <label className="stacked-label">
              <span>Verkoopprijs excl. btw (€)</span>
              <input
                name="salePriceEx"
                inputMode="decimal"
                placeholder={`leeg: inkoop + ${String(markupPct).replace(".", ",")}%`}
                defaultValue={price(article?.salePriceExCents ?? null)}
              />
            </label>
            <label className="stacked-label">
              <span>Btw</span>
              <select name="vatRate" defaultValue={article?.vatRate ?? 21}>
                {VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
              </select>
            </label>
            <label className="stacked-label">
              <span>Inkoopprijs excl. btw (€)</span>
              <input name="purchasePriceEx" inputMode="decimal" defaultValue={price(article?.purchasePriceExCents ?? null)} />
            </label>
            <label className="stacked-label">
              <span>Voorraad</span>
              <input name="stockQuantity" inputMode="numeric" defaultValue={article?.stockQuantity ?? ""} />
            </label>
            <label className="stacked-label customer-wide">
              <span>Afbeelding (webadres, optioneel)</span>
              <input name="imageUrl" type="url" maxLength={1000} value={imageUrl} onChange={(event) => setImageUrl(event.target.value.trim())} />
            </label>
          </div>
        </fieldset>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="button-row dialog-actions">
          <button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()} disabled={pending}>
            Annuleren
          </button>
          <button type="submit" className="primary-button" disabled={pending}>
            {pending ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
