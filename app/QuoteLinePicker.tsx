"use client";

import { useEffect, useRef, useState } from "react";
import { articleDescription, compareArticles, groupArticles, salePriceInclCents, type Article } from "../lib/articles";
import { articleLine, stoveLine, type DraftLine } from "../lib/invoice-draft";
import { formatPrice } from "../lib/price";
import type { QuoteStoveOption } from "../lib/quote-queries";
import { stoveProductName } from "../lib/stove-specs";
import { CONDITION_LABELS, type Condition } from "../lib/stoves";

type Item = { key: string; label: string; detail: string; line: () => DraftLine };
type Group = { key: string; title: string; items: Item[] };

const CONDITION_ORDER: (Condition | null)[] = ["used", "new", null];

function stoveGroups(stoves: QuoteStoveOption[]): Group[] {
  return CONDITION_ORDER.map((condition) => ({
    key: condition ?? "other",
    title: condition ? CONDITION_LABELS[condition] : "Overig",
    items: stoves
      .filter((stove) => stove.condition === condition)
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
        line: () => articleLine(article),
      };
    }),
  }));
}

type LineBrowserProps = {
  title: string;
  groups: Group[];
  onPick: (line: DraftLine) => void;
  onClose: () => void;
};

// A scrollable list in groups to pick quote lines from; stays open to add several. Rendered only while open.
function LineBrowser({ title, groups, onPick, onClose }: LineBrowserProps) {
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

type QuoteLinePickerProps = {
  /** Leave out to offer articles only (invoices). */
  stoves?: QuoteStoveOption[];
  articles: Article[];
  onPick: (line: DraftLine) => void;
  disabled?: boolean;
};

// "Kachel toevoegen" (when stoves are given) and "Artikel toevoegen": each opens a list to scroll
// through and pick from.
export default function QuoteLinePicker({ stoves, articles, onPick, disabled }: QuoteLinePickerProps) {
  const [browsing, setBrowsing] = useState<"stove" | "article" | null>(null);

  return (
    <>
      {stoves && (
        <button type="button" className="secondary-button" onClick={() => setBrowsing("stove")} disabled={disabled}>
          ＋ Kachel toevoegen
        </button>
      )}
      <button type="button" className="secondary-button" onClick={() => setBrowsing("article")} disabled={disabled}>
        ＋ Artikel toevoegen
      </button>
      {browsing && (
        <LineBrowser
          title={browsing === "stove" ? "Kachel toevoegen" : "Artikel toevoegen"}
          groups={browsing === "stove" ? stoveGroups(stoves ?? []) : articleGroups(articles)}
          onPick={onPick}
          onClose={() => setBrowsing(null)}
        />
      )}
    </>
  );
}
