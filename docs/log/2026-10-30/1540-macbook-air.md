# 2026-10-30 15:40 – macbook-air

Branch: `feature/quote-article-codes`

## Done
- The quote PDF has an "Artikelcode" column between Product and Hoeveelheid, so an order can be
  placed straight from the quote. The code is the article's SKU or, for a stove imported from a
  supplier catalogue, its `supplier_sku`. Looked up when the quote is read (`lib/line-codes.ts`) and
  in the quote dialog from the loaded articles and stoves; never stored on the line. The column only
  shows when a line has a code, so invoices and quotes without codes look as before. Long codes wrap
  within the column.
- Checked: `tsc`, production build, sample PDFs with and without codes rendered from the compiled
  PDF module with made-up data. Not checked in the real app with real quotes.

## Decisions
- User chose the codes on the customer PDF over an internal order list, knowing customers then see
  the supplier codes.

## Open items
- Check an existing quote with articles in the app (staging) and confirm the codes are right.
- Not yet pushed or released.
