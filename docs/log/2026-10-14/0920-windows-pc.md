# 2026-10-14 09:20 – windows-pc

Branches: `feature/made-to-order-stock-only`, `feature/shop-orders-lower-app-stock`

## Done
- "Webshop bijwerken" no longer sends every made-to-order stove again (details, photos); the button
  "Voorraad nu bijwerken" only sets the stock fields back to one, through WooCommerce's
  `products/batch`.
- Nightly restock: Vercel Cron calls `/api/cron/restock-shop` at 04:00 UTC (Production only). It
  asks WooCommerce for published app products on backorder (= made-to-order stoves ticked in the
  app that were sold, or still in the old backorder state) and sets their stock back to one, so
  GoedGeplaatst keeps forwarding them to Marktplaats. In-stock stoves never allow backorders and
  unticked stoves are drafts, so they are not touched. See docs/woocommerce-sync.md.
- Released to staging and production. The user ran "Voorraad nu bijwerken": it worked.
- Shop orders now lower the app stock: WooCommerce webhooks "Bestelling toegevoegd" and "Bestelling
  geüpdatet" call `/api/webhooks/woocommerce` (signed with `WOOCOMMERCE_WEBHOOK_SECRET`); the app
  copies the shop stock of each stove in the order (not made-to-order) and, at 0, unlists it and takes
  the shop product offline. Uses the Supabase secret key (`SUPABASE_SECRET_KEY`, only in
  `lib/supabase/admin.ts`) because there is no signed-in user. Released to staging and production.

## Decisions
- User: a made-to-order stove stays online after a shop sale and goes back in stock for
  GoedGeplaatst as long as it is ticked in the app; only new stoves we do not hold (made to order).
- Daily reset chosen over a higher stock number (which could show "10 op voorraad").
- User approved a WooCommerce order webhook with the Supabase secret key for shop orders; the app
  copies the shop stock instead of subtracting, so repeated deliveries and cancellations are safe.

## Open items
- `CRON_SECRET` added by the user; included in the deploy of the order webhook.
- User: add `SUPABASE_SECRET_KEY` and `WOOCOMMERCE_WEBHOOK_SECRET` (Production) in Vercel, redeploy,
  and save both WooCommerce webhooks. Then test with an order; the database part is untested.
- A cancelled shop order restores the app stock but does not list the stove again (tick it by hand).
- Restock tested by the user on the live shop.
- Then check that the HAVÉ products reach Marktplaats and how the shop shows their stock.
- Still open from earlier logs: `shop_sync_enabled` column,
  test product 100006, Vercel Skew Protection, invoice amount format "€ -100,00".

## Manual steps and migrations
- No migrations. Vercel: `CRON_SECRET` (done), `SUPABASE_SECRET_KEY`, `WOOCOMMERCE_WEBHOOK_SECRET`.
