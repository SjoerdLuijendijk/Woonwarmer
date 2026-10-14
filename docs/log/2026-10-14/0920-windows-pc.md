# 2026-10-14 09:20 – windows-pc

Branch: `feature/made-to-order-stock-only`

## Done
- "Webshop bijwerken" no longer sends every made-to-order stove again (details, photos); the button
  "Voorraad nu bijwerken" only sets the stock fields back to one, through WooCommerce's
  `products/batch`.
- Nightly restock: Vercel Cron calls `/api/cron/restock-shop` at 04:00 UTC (Production only). It
  asks WooCommerce for published app products on backorder (= made-to-order stoves ticked in the
  app that were sold, or still in the old backorder state) and sets their stock back to one, so
  GoedGeplaatst keeps forwarding them to Marktplaats. In-stock stoves never allow backorders and
  unticked stoves are drafts, so they are not touched. See docs/woocommerce-sync.md.
- Released to staging and production.

## Decisions
- User: a made-to-order stove stays online after a shop sale and goes back in stock for
  GoedGeplaatst as long as it is ticked in the app; only new stoves we do not hold (made to order).
- Daily reset chosen over a higher stock number (which could show "10 op voorraad").

## Open items
- User: add `CRON_SECRET` (Production) in Vercel; without it the nightly run refuses every call.
- Not tested against the live shop; the first press of "Voorraad nu bijwerken" is the real test
  (it should also fix the ~426 HAVÉ products still on backorder without stock).
- Then check that the HAVÉ products reach Marktplaats and how the shop shows their stock.
- Still open from earlier logs: shop orders do not lower app stock, `shop_sync_enabled` column,
  test product 100006, Vercel Skew Protection, invoice amount format "€ -100,00".

## Manual steps and migrations
- No migrations. `CRON_SECRET` to be added in Vercel by the user.
