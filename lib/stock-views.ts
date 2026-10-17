import { ROUTES } from "./navigation";

// The current stock (Voorraad → Aanbod) and the sold archive (Voorraad → Verkocht archief).
export type StockView = "available" | "sold";

export const STOCK_VIEW_HREFS: Record<StockView, string> = {
  available: ROUTES.stock,
  sold: ROUTES.sold,
};
