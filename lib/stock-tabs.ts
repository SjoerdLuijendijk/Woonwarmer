import { ROUTES } from "./navigation";
import type { StoveKind } from "./stove-display";

// The tabs of the stock page (Aanbod): the three kinds of stove, and the separate articles (flue
// parts and accessories). The URL names the tab with ?soort=, so a tab can be linked to.
export type StockTab = StoveKind | "articles";

export const STOCK_TAB_LABELS: Record<StockTab, string> = {
  used: "Gereviseerd",
  new: "Nieuw",
  order: "Op bestelling",
  articles: "Losse artikelen",
};

const SLUGS: Record<StockTab, string> = { used: "gereviseerd", new: "nieuw", order: "op-bestelling", articles: "artikelen" };

export function stockTabHref(tab: StockTab) {
  return `${ROUTES.stock}?soort=${SLUGS[tab]}`;
}

export function parseStockTab(value: string | string[] | undefined): StockTab | null {
  const slug = Array.isArray(value) ? value[0] : value;
  return (Object.keys(SLUGS) as StockTab[]).find((tab) => SLUGS[tab] === slug) ?? null;
}
