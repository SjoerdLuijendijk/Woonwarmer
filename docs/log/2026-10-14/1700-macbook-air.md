# 2026-10-14 17:00 – macbook-air

Branch: `feature/invoice-lowers-stock`

## Done
- A final invoice for a stove now takes the sold units from its stock, in the same transaction as
  the invoice (`create_invoice` with `p_stock_deduction`; stored as `invoices.stock_deducted`). The
  units are the quantity on the lines that came from the stove (stove line or quote line). At stock 0
  the stove is sold, unlisted and taken offline in the web shop. Released to staging and production.
- The invoice dialog shows a tick box "N van de voorraad afhalen (nu X op voorraad)", off by default
  when the stove has a sale "Af te leveren" (that sale already took a unit). Made-to-order and
  sold-out stoves and invoices without a stove line do not change the stock.

## Decisions
- User: take the quantity on the stove line, not always 1.
- User: the team keeps using "Verkocht" next to invoices, so the dialog warns against taking a unit twice.

## Open items
- Not tested in the browser or with a real invoice (invoices use the real number series).
- A new-model sale marked "Verkocht" and delivered at once leaves no open sale, so the tick box is on
  for its invoice; the user has to untick it.
- An invoice from a quote with several stoves is a separate invoice and takes no stock.
- The three-argument `create_invoice` wrapper can be dropped in a later migration now that the new
  code is live.
- Unchanged from the 13:50 log: Vercel `SUPABASE_SECRET_KEY` and `WOOCOMMERCE_WEBHOOK_SECRET`,
  save both WooCommerce webhooks and test with an order; cancelled orders do not relist a stove;
  check the HAVÉ products on Marktplaats; `shop_sync_enabled` column, test product 100006, Vercel
  Skew Protection, invoice amount format "€ -100,00".

## Manual steps and migrations
- `20261014150000_invoice_lowers_stock.sql`: applied by the user in the SQL Editor and verified
  (column present, both function versions, no anon execute).
