# 2026-10-14 13:10 – windows-pc

Branch: `fix/print-sort-by-number`

## Done
- The stock printout is sorted by stove number (ascending) instead of brand, within the "Nieuw"
  and "Gereviseerd" sections. Released to staging and production; not checked in the browser by me.

## Open items
- Still open from the 09:20 log: Vercel `SUPABASE_SECRET_KEY` and `WOOCOMMERCE_WEBHOOK_SECRET`,
  save both WooCommerce webhooks and test with an order; cancelled orders do not relist a stove;
  check the HAVÉ products on Marktplaats; `shop_sync_enabled` column, test product 100006, Vercel
  Skew Protection, invoice amount format "€ -100,00".
- GitHub reports the repository moved to `SjoerdLuijendijk/Woonwarmer`; the remote URL still works.
