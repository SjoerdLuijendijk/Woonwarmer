# 2026-10-14 13:50 – windows-pc

Branch: `fix/print-row-lines`

## Done
- The row lines in the stock printout were 0.5pt light grey and faded away on paper; they are now
  0.75pt dark grey, like Excel gridlines. Released to staging and production; not checked on paper
  by me.

## Open items
- Unchanged from the 13:10 log: Vercel `SUPABASE_SECRET_KEY` and `WOOCOMMERCE_WEBHOOK_SECRET`,
  save both WooCommerce webhooks and test with an order; cancelled orders do not relist a stove;
  check the HAVÉ products on Marktplaats; `shop_sync_enabled` column, test product 100006, Vercel
  Skew Protection, invoice amount format "€ -100,00".
