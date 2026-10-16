"use client";

import { useEffect, useRef, useState } from "react";
import { articleDescription, compareArticles, groupArticles, salePriceInclCents, type Article } from "../lib/articles";
import { articleLine, stoveLine, type DraftLine } from "../lib/invoice-draft";
import { formatPrice } from "../lib/price";
import type { QuoteStoveOption } from "../lib/quote-queries";
import { stoveProductName } from "../lib/stove-specs";
import { CONDITION_LABELS, type Condition } from "../lib/stoves";
import ArticleThumb from "./ArticleThumb";

type Item = { key: string; label: string; detail: string; imageUrl?: string | null; line: () => DraftLine };
type Group = { key: string; title: string; items: Item[] };

type StoveGroupKey = Condition | "order" | "other" | "sold";
const STOVE_GROUP_TITLES: Record<StoveGroupKey, string> = { ...CONDITION_LABELS, order: "Op bestelling", other: "Overig", sold: "Verkocht" };
const STOVE_GROUP_ORDER: StoveGroupKey[] = ["used", "new", "order", "other", "sold"];

function stoveGroupOf(stove: QuoteStoveOption): StoveGroupKey {
  if (stove.madeToOrder) return "order";
  if (stove.sold) return "sold";
  return stove.condition ?? "other";
}

function stoveGroups(stoves: QuoteStoveOption[]): Group[] {
  return STOVE_GROUP_ORDER.map((key) => ({
    key,
    title: STOVE_GROUP_TITLES[key],
    items: stoves
      .filter((stove) => stoveGroupOf(stove) === key)
      .map((stove) => ({
        key: `stove-${stove.number}`,
        label: `${stove.number} · ${stoveProductName(stove)}`,
        detail: stove.priceCents ? formatPrice(stove.priceCents) : "geen prijs",
        line: () => stoveLine(stove),
      })),
  })).filter((group) => group.items.length > 0);
}

function articleGroups(articles: Article[]): Group[] {
  return groupArticles([...articles].sort(compareArticles)).map((group) => ({
    key: group.key,
    title: group.category ?? "Zonder categorie",
    items: group.articles.map((article) => {
      const price = salePriceInclCents(article);
      return {
        key: `article-${article.id}`,
        label: articleDescription(article),
        detail: price === null ? "geen prijs" : `${formatPrice(price)} incl.`,
        imageUrl: article.imageUrl,
        line: () => articleLine(article),
      };
    }),
  }));
}

export type LineSource = "stove" | "article";

type LineBrowserProps = {
  source: LineSource;
  stoves?: QuoteStoveOption[];
  articles: Article[];
  onPick: (line: DraftLine) => void;
  onClose: () => void;
};

// A scrollable list of stoves or articles in groups to pick lines from; stays open to add several.
// Rendered only while open.
export default function LineBrowser({ source, stoves, articles, onPick, onClose }: LineBrowserProps) {
  const title = source === "stove" ? "Kachel toevoegen" : "Artikel toevoegen";
  const groups = source === "stove" ? stoveGroups(stoves ?? []) : articleGroups(articles);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.length === 1 ? [groups[0].key] : []));
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pick(item: Item) {
    onPick(item.line());
    setAdded((count) => count + 1);
  }

  return (
    <dialog ref={dialogRef} className="edit-dialog line-browser" aria-labelledby="line-browser-title" onClose={onClose}>
      <div className="invoice-dialog-header">
        <h2 id="line-browser-title">{title}</h2>
        <button type="button" className="line-remove" onClick={() => dialogRef.current?.close()} aria-label="Sluiten">×</button>
      </div>
      <div className="line-browser-list">
        {groups.length === 0 && <p className="muted">Er is niets om toe te voegen.</p>}
        {groups.map((group) => (
          <section key={group.key} className="line-browser-group">
            <button type="button" className="line-browser-group-title" aria-expanded={open.has(group.key)} onClick={() => toggle(group.key)}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
              {group.title}
              <span className="agenda-day-count">{group.items.length}</span>
            </button>
            {open.has(group.key) && (
              <ul>
                {group.items.map((item) => (
                  <li key={item.key}>
                    <button type="button" onClick={() => pick(item)}>
                      {item.imageUrl !== undefined && <ArticleThumb url={item.imageUrl} />}
                      <span className="line-picker-label">{item.label}</span>
                      <span className="line-picker-detail">{item.detail}</span>
                      <span className="line-browser-add" aria-hidden="true">＋</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <div className="button-row dialog-actions">
        {added > 0 && <span className="muted line-browser-added" role="status">{added} toegevoegd</span>}
        <button type="button" className="primary-button" onClick={() => dialogRef.current?.close()}>Klaar</button>
      </div>
    </dialog>
  );
}
