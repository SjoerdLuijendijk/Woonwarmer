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
- Released the editable invoices to staging and production. Added the local permission rule
  `Bash(git push origin main)` on this Mac so releases can be pushed from Claude Code.
- Branch `feature/invoice-dialog-layout`: calmer, more compact invoice and quote dialogs. Sticky header
  (title, date, stove) and sticky footer with status and buttons; customer details on three rows; lines
  as a table with one row of headings (cards on a phone); one "＋ Nieuwe regel" menu (Kachel for quotes,
  Artikel, Montage, Losse regel) instead of separate buttons; totals as a narrow block on the right.
  `QuoteLinePicker` became `LineBrowser`, opened from the new `AddLineMenu`. Checked with a static
  HTML copy of the markup in headless Chrome (desktop and 390px), not in the real app.
- Released the dialog layout to staging and production.
- Branch `feature/invoice-pick-stove`: "＋ Nieuwe regel" in a separate invoice (and an invoice from a
  quote) offers Kachel, with groups Gereviseerd, Nieuw, Op bestelling, Overig and Verkocht (invoices list
  sold stoves too; quotes do not). With exactly one stove on the lines the invoice is about that stove
  (`invoiceStoveNumber`), shown under the title, and the stock option loads for it
  (`getStoveStockForInvoice`). Quotes now also show the Op bestelling group.
- Released stove picking to staging and production.
- HAVÉ flue assortment: read the dealer portal (mijn.haveverwarming.nl, Bestellen → afvoermateriaal gas,
  hout, pellet and flexibel) in the user's logged-in Chrome session: 1,741 articles in 97 groups with
  the net purchase price excl. VAT, no sale price (the team sets the margin). At the user's request the
  231 existing articles were deleted in the app first, then the six CSV parts (max. 300 rows each)
  were imported through Artikelen → CSV importeren. The CSV files are in ~/Downloads/HAVE-afvoermateriaal
  on this Mac (not in the repository: they contain purchase prices).
- Branch `fix/list-beyond-1000-rows`: Supabase returns at most 1,000 rows per request, so the article
  list stopped at 1,000. `selectAllPages` (lib/all-pages.ts) reads articles and the invoice/quote stove
  list page by page.

## Decisions
- User: invoices are not sent from the app yet, so they stay editable with the same number (no credit
  invoice). The invoice records who changed it last (`updated_at`, `updated_by`).

## Open items
- Editable invoices: not checked in the browser by me after the production release.
- Other unpaged lists (stock table `getStoves`, invoices, quotes) still stop at 1,000 rows; fine for now.
- Articles have no sale price yet: a margin per category would save entering 1,741 prices by hand.
- Article images: the portal's images only load when logged in; storing them in the app is a separate task.
- Dialog layout: check in the real app (create invoice, edit invoice, quote), including the
  "＋ Nieuwe regel" menu inside the dialog on Safari and on a phone. Long descriptions are still cut
  off in the line field (full text on hover).
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
