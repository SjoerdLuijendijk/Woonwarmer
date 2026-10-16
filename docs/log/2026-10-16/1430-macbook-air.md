# 2026-10-16 14:30 – macbook-air

Branch: `feature/edit-invoices`

## Done
- The local copy was missing on this Mac; the repository was cloned again into `~/Documents/Testomgeving`.
- An invoice in the list Facturen opens in a dialog (click the row or the invoice number) with a live
  PDF preview. Customer details and lines can be corrected and saved (`update_invoice`). Number, issue
  date, seller details, stove and stock deduction stay as created; a change does not touch the stock.
  The download in the dialog is the saved version.
- The confirmation when making an invoice no longer says it cannot be changed afterwards.
- New `usePdfPreview` hook for the live preview, used by the new dialog.

## Decisions
- User: invoices are not sent from the app yet, so they stay editable with the same number (no credit
  invoice). The invoice records who changed it last (`updated_at`, `updated_by`).

## Open items
- Not tested in the browser yet; test on the preview deployment of this branch, then release to staging.
- Editing the quantity on a stove line does not adjust the stock; correct the stock by hand.
- Two people editing the same invoice at once: the last save wins.
- `InvoiceDialog` and `QuoteDialog` still have their own preview code; they can use `usePdfPreview`.
- Once invoices are sent from the app, sent invoices should be locked (corrections via credit invoice).
- Unchanged from the 14 Oct 17:00 log: test invoice stock deduction in the browser; drop the
  three-argument `create_invoice` wrapper; Vercel `SUPABASE_SECRET_KEY` and `WOOCOMMERCE_WEBHOOK_SECRET`,
  save both WooCommerce webhooks and test with an order; cancelled orders do not relist a stove; check
  the HAVÉ products on Marktplaats; `shop_sync_enabled` column, test product 100006, Vercel Skew
  Protection, invoice amount format "€ -100,00".

## Manual steps and migrations
- `20261016120000_editable_invoices.sql`: applied by the user in the SQL Editor and verified (columns
  present, function security definer, no anon execute, authenticated execute).
