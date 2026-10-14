# 2026-10-14 06:20 – windows-pc

Branches: `fix/sign-photo-urls-in-batches`, `feature/fast-stock-page`

## Done
- The stock page failed ("Er ging iets mis"): after the HAVÉ import it asked Storage to sign more
  than 1000 photo paths at once (`body/paths must NOT have more than 1000 items`). Photo URLs are
  now signed in batches of 1000. Released to staging and production.
- The stock page is fast again with a large stock: only each stove's main photo is signed, the
  table shows 70 rows and adds 70 more while scrolling ("Meer tonen" button too), and a stove's
  other photos load when the photo viewer or the edit dialog opens (`loadStovePhotos`). Search,
  tabs and sorting still cover all stoves. Released to staging and production.
- Checked: the HAVÉ import has run (web shop: 522 published products = 96 + 426).
- GoedGeplaatst skipped made-to-order products (on backorder, no stock management); the user
  confirmed a product appears once its stock is set to 1 by hand. Made-to-order stoves now go to
  WooCommerce with managed stock 1 and backorders allowed. New "Webshop bijwerken" block under
  Catalogus importeren sends every made-to-order stove with a shop product again. Released to
  staging and production (branch `feature/made-to-order-in-stock`).

## Decisions
- User: show 70 stoves on opening, the rest while scrolling or searching.

## Open items
- Not tested in the browser by me (Chrome extension not connected); the user approved the release.
- The page still sends every stove's details (including long HAVÉ descriptions) to the browser;
  next step if it is still slow. PostgREST returns at most 1,000 stoves by default.
- The user still has to run "Kachels op bestelling bijwerken" (est. 20–30 min, not measured) and
  then check that the HAVÉ products reach Marktplaats, the ad costs/limits, and how the shop
  product page shows the stock ("Op voorraad" instead of "Nabestelling").
- A shop order of a made-to-order stove sets its shop stock to 0 (backorder), which drops the
  Marktplaats ad until the stove is synced again.
- Resolved from the 2026-10-13 logs: both migrations applied, invoices tested by the user.
- Still open from earlier logs: shop orders do not lower app stock, `shop_sync_enabled` column,
  test product 100006, Vercel Skew Protection, invoice amount format "€ -100,00".

## Manual steps and migrations
- None.
