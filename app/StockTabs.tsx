import Link from "next/link";
import type { StoveKind } from "../lib/stove-display";
import { STOCK_TAB_LABELS, stockTabHref, type StockTab } from "../lib/stock-tabs";

const ICONS: Record<StockTab, React.ReactNode> = {
  // Refurbished: arrows going round.
  used: (
    <>
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  // New: a sparkle.
  new: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />,
  // Made to order: a clipboard with a tick.
  order: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="m9 13 2 2 4-4" />
    </>
  ),
  // Separate articles: a box.
  articles: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
};

type StockTabsProps = {
  tabs: { tab: StockTab; count: number }[];
  active: StockTab;
  /** Switches between the stove kinds without loading the page again; other tabs are links. */
  onSelectKind?: (kind: StoveKind) => void;
};

// The tabs of the stock page, each with its own icon and colour.
export default function StockTabs({ tabs, active, onSelectKind }: StockTabsProps) {
  return (
    <div className="kind-tabs" role="group" aria-label="Soort aanbod">
      {tabs.map(({ tab, count }) => {
        const content = (
          <>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[tab]}
            </svg>
            {STOCK_TAB_LABELS[tab]} <span>{count}</span>
          </>
        );
        const className = `kind-tab kind-tab--${tab}`;
        return onSelectKind && tab !== "articles" ? (
          <button key={tab} type="button" className={className} aria-pressed={active === tab} onClick={() => onSelectKind(tab)}>
            {content}
          </button>
        ) : (
          <Link key={tab} href={stockTabHref(tab)} className={className} aria-current={active === tab ? "page" : undefined}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
