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
- Released the paging fix; the app now shows all 1,741 articles in 97 groups.
- Branch `feature/article-markup`: Artikelen → "Opslag op inkoopprijs" (table `article_settings`,
  default and set to 40%). Articles without a sale price of their own get purchase price × (1 + markup)
  excl. VAT, computed when listed (`markupSalePriceExCents`), so changing the markup changes all such
  prices at once; an article's own sale price always wins. Shown muted in the article list.
- Released the markup (user confirmed ×1.40 on purchase price); migration applied and verified.
- Branch `feature/article-images`: public-read bucket `article-images` (team members write, JPEG only,
  1 MB), files named by content hash so shared photos are stored once; `articles.image_url` holds the
  public URL. Artikelen → "Afbeeldingen importeren" takes images named after the SKU, one per Server
  Action call, resized to max. 800 px JPEG with sharp. Thumbnails in the article list and line browser.
- Released article images. Fetched the photo of every HAVÉ article from its portal product page in the
  logged-in Chrome session (1,741 pages, 570 distinct images) and imported them through the app:
  1,683 articles have a photo; the other 58 have none in the portal either. Temporary local copies
  were moved to the Trash afterwards, as were the article CSV files.
- Branch `fix/article-image-slash-sku` (released): a "/" cannot be in a file name, so the image import
  also matches "0502_31001" to SKU "0502/31001" when no article has the name exactly.
- Deleted the merged branches of today locally and on GitHub.
- Branch `feature/articles-tab-in-stock`: Aanbod has a fourth tab "Losse artikelen" (?soort=artikelen)
  that shows the article list under the stock title; every tab has its own icon and colour
  (`StockTabs`, `lib/stock-tabs.ts`). Tabs are two by two on a phone. Counts come from head-count
  queries (`countArticles`, `countStovesByKind`) so neither view loads the other's rows.

## Decisions
- User: invoices are not sent from the app yet, so they stay editable with the same number (no credit
  invoice). The invoice records who changed it last (`updated_at`, `updated_by`).

- Branch `fix/invoice-preview-after-picker`: the invoice preview stopped ("Voorvertoning maken…")
  after closing the article or stove list with "Klaar": React passed the nested dialog's close event to
  the invoice dialog, which then stopped its preview. It now only reacts to closing itself, as the
  quote and edit dialogs already did.
- Branch `feature/images-on-invoices`: invoice and quote PDFs show a photo in front of lines that came
  from an article (its photo) or a stove (its main photo, the small copy when there is one).
  `invoice_lines` now store `stove_number` and `article_id` like quote lines
  (`20261016210000_invoice_line_sources.sql`); `lib/line-images.ts` resolves the URLs, the dialogs ask
  for them once per stove or article (`useLineImages`), and the PDF fetches them with an 8 s timeout
  and leaves out any it cannot load. Invoices made before this have no photos.

## Open items
- Editable invoices: not checked in the browser by me after the production release.
- Other unpaged lists (stock table `getStoves`, invoices, quotes) still stop at 1,000 rows; fine for now.
- Markup is one percentage for all articles; per category is possible later if needed.
- HAVÉ prices and photos do not update by themselves: re-read the portal (or ask HAVÉ for their XML
  feed) to refresh purchase prices; the CSV import keeps sale prices entered in the app.
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
- `20261016210000_invoice_line_sources.sql`: to be applied by the user before
  `feature/images-on-invoices` is released (getInvoice reads the new columns).
- `20261016190000_article_images.sql`: applied by the user and verified (bucket public, 1 MB, JPEG;
  insert and delete policies for team members).
- `20261016170000_article_markup.sql`: applied by the user and verified (40%, RLS, policies, no anon access).
- `20261016120000_editable_invoices.sql`: applied by the user in the SQL Editor and verified (columns
  present, function security definer, no anon execute, authenticated execute).
