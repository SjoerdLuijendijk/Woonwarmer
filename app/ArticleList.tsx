"use client";

import { useMemo, useState, useTransition } from "react";
import { compareArticles, groupArticles, salePriceExCents, salePriceInclCents, type Article } from "../lib/articles";
import { formatPrice } from "../lib/price";
import { onRowClick } from "../lib/row-click";
import { deleteArticle, deleteArticles } from "./article-actions";
import ArticleDialog from "./ArticleDialog";
import ArticleImageImport from "./ArticleImageImport";
import ArticleImport from "./ArticleImport";
import ArticleThumb from "./ArticleThumb";
import ArticleMarkupForm from "./ArticleMarkupForm";
import { useDialog } from "./DialogProvider";

const COLUMN_COUNT = 8;

function matches(article: Article, words: string[]) {
  const haystack = [article.name, article.category, article.brand, article.diameterMm, article.lengthMm && String(article.lengthMm), article.color]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const money = (cents: number | null) => (cents === null ? "—" : formatPrice(cents, { alwaysCents: true }));

// Settings → Artikelen: the parts used on quotes, grouped per category in the stock table layout.
// Groups start collapsed; a search opens the groups with matches. Checkboxes per row and per group
// select articles to delete together. Articles without a sale price show the price from the markup.
export default function ArticleList({ articles, markupPct }: { articles: Article[]; markupPct: number }) {
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ article: Article | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useDialog();

  const groups = useMemo(() => groupArticles([...articles].sort(compareArticles)), [articles]);
  const categories = groups.flatMap(({ category }) => (category === null ? [] : [category]));
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const visibleGroups = groups
    .map((group) => ({ ...group, articles: group.articles.filter((article) => matches(article, words)) }))
    .filter((group) => group.articles.length > 0);
  const allOpen = groups.every(({ key }) => openGroups.has(key));
  // Ids of articles deleted elsewhere drop out of the selection.
  const selectedIds = articles.filter(({ id }) => checkedIds.has(id)).map(({ id }) => id);

  function setChecked(ids: number[], checked: boolean) {
    setCheckedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function removeSelected() {
    const count = selectedIds.length;
    const confirmed = await confirm({
      title: count === 1 ? "1 artikel verwijderen?" : `${count} artikelen verwijderen?`,
      message: "Bestaande offertes houden de regels.",
      confirmLabel: "Verwijderen",
      danger: true,
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteArticles(selectedIds);
      if (result.ok) setCheckedIds(new Set());
      else await notify(result.error);
    });
  }

  function toggle(key: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function remove(article: Article) {
    const confirmed = await confirm({ title: `${article.name} verwijderen?`, message: "Bestaande offertes houden de regel.", confirmLabel: "Verwijderen", danger: true });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteArticle(article.id);
      if (!result.ok) await notify(result.error);
    });
  }

  return (
    <section aria-labelledby="articles-title">
      <div className="stock-toolbar">
        <div className="stock-title-row">
          <h1 id="articles-title">Artikelen</h1>
          <div className="toolbar-actions">
            <ArticleImport />
            <ArticleImageImport />
            <button type="button" className="sale-button" onClick={() => setEditing({ article: null })}>+ Nieuw artikel</button>
          </div>
        </div>
        <ArticleMarkupForm markupPct={markupPct} />
        <input
          className="search-input"
          type="search"
          placeholder="Zoek op naam, categorie of diameter"
          aria-label="Zoeken"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {!searching && groups.length > 1 && (
          <button
            type="button"
            className="secondary-button toolbar-button"
            onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups.map(({ key }) => key)))}
          >
            {allOpen ? "Alles inklappen" : "Alles uitklappen"}
          </button>
        )}
        {selectedIds.length > 0 && (
          <div className="selection-bar" role="status">
            <span>{selectedIds.length === 1 ? "1 artikel geselecteerd" : `${selectedIds.length} artikelen geselecteerd`}</span>
            <button type="button" className="secondary-button toolbar-button" onClick={() => setCheckedIds(new Set())} disabled={pending}>
              Selectie wissen
            </button>
            <button type="button" className="primary-button danger-button toolbar-button" onClick={removeSelected} disabled={pending}>
              Verwijderen
            </button>
          </div>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <div className="notice">
          <p>{articles.length === 0 ? "Nog geen artikelen. Importeer een CSV of voeg een artikel toe." : "Geen artikelen gevonden."}</p>
        </div>
      ) : (
        <div className="table-wrap" aria-busy={pending}>
          <table className="stove-table invoice-table article-table">
            <thead>
              <tr>
                <th scope="col" className="cell-select"><span className="visually-hidden">Selecteren</span></th>
                <th scope="col">Naam</th>
                <th scope="col" className="cell-numeric">Ø mm</th>
                <th scope="col" className="cell-numeric">Lengte mm</th>
                <th scope="col">Eenheid</th>
                <th scope="col" className="cell-numeric">Prijs excl.</th>
                <th scope="col" className="cell-numeric">Prijs incl.</th>
                <th scope="col" className="cell-actions"><span className="visually-hidden">Verwijderen</span></th>
              </tr>
            </thead>
            {visibleGroups.map((group) => {
              const open = searching || openGroups.has(group.key);
              const groupIds = group.articles.map(({ id }) => id);
              const groupChecked = groupIds.filter((id) => checkedIds.has(id)).length;
              const groupLabel = group.category ?? "Zonder categorie";
              return (
                <tbody key={group.key}>
                  <tr className="article-group">
                    <th scope="colgroup" colSpan={COLUMN_COUNT}>
                      <div className="article-group-head">
                        <input
                          type="checkbox"
                          className="row-check"
                          aria-label={`Alle artikelen in ${groupLabel} selecteren`}
                          checked={groupChecked === groupIds.length}
                          ref={(input) => {
                            if (input) input.indeterminate = groupChecked > 0 && groupChecked < groupIds.length;
                          }}
                          onChange={(event) => setChecked(groupIds, event.target.checked)}
                        />
                        <button type="button" aria-expanded={open} onClick={() => toggle(group.key)} disabled={searching}>
                          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                          {groupLabel}
                          <span className="agenda-day-count">{group.articles.length}</span>
                        </button>
                      </div>
                    </th>
                  </tr>
                  {open &&
                    group.articles.map((article) => (
                      <tr key={article.id} className="clickable-row" onClick={onRowClick(() => setEditing({ article }))}>
                        <td className="cell-select">
                          {/* The label fills the cell, so a click next to the box does not open the article. */}
                          <label>
                            <input
                              type="checkbox"
                              className="row-check"
                              aria-label={`${article.name} selecteren`}
                              checked={checkedIds.has(article.id)}
                              onChange={(event) => setChecked([article.id], event.target.checked)}
                            />
                          </label>
                        </td>
                        <td data-label="Naam" className="cell-brand">
                          <span className="article-name">
                            <ArticleThumb url={article.imageUrl} />
                            {article.name}
                          </span>
                        </td>
                        <td data-label="Ø mm" className="cell-numeric">{article.diameterMm?.replace(">", " → ") ?? "—"}</td>
                        <td data-label="Lengte mm" className="cell-numeric">{article.lengthMm ?? "—"}</td>
                        <td data-label="Eenheid">{article.unit ?? "—"}</td>
                        <td data-label="Prijs excl." className="cell-numeric cell-nowrap">
                          {article.salePriceExCents === null && article.markupSalePriceExCents !== null ? (
                            <span className="muted" title={`Inkoop + ${String(markupPct).replace(".", ",")}%`}>{money(salePriceExCents(article))}</span>
                          ) : (
                            money(article.salePriceExCents)
                          )}
                        </td>
                        <td data-label="Prijs incl." className="cell-numeric cell-nowrap">{money(salePriceInclCents(article))}</td>
                        <td className="cell-actions">
                          <button type="button" className="icon-button icon-button--danger" onClick={() => remove(article)} title="Verwijderen" aria-label={`${article.name} verwijderen`}>
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {editing && <ArticleDialog article={editing.article} categories={categories} markupPct={markupPct} onClose={() => setEditing(null)} />}
    </section>
  );
}
