# 2026-10-13 14:21 – macbook-air

Branches: `feature/shop-ad-description`, `feature/ad-before-shop-sync`, `feature/app-as-shop-source`

## Done
- The stove's Marktplaats ad text is now sent to WooCommerce as the product description (falls back
  to the stove's own description), so the shop's GoedGeplaatst connector (GoStockr) can forward it
  to Marktplaats. The product is synced again whenever a new ad is stored (background, regenerate,
  manual edit). "Alles uit webshop ophalen" no longer copies the description back for stoves with
  an ad. Released to staging and production.
- Adding, editing or making a stove to order now syncs it to the shop only after its ad text is
  generated (or failed), so the product arrives with its ad text. Released to staging and production.
- Added `app/error.tsx`: a save from a page left open during a release (unknown server action) now
  shows "De app is bijgewerkt" with a reload button instead of failing silently.
- The user reports the GoedGeplaatst plugin (official, v1.1.1) now passes the ad text on.
- The app is now the only source of the web shop: removed Koppelen, Alles koppelen, Alles uit
  webshop ophalen and the shop import (code included); the sync no longer checks `shop_sync_enabled`.
- Added a temporary one-off reset in Admin → Webshop: step 1 regenerates every ad (manual ones too)
  and syncs every stove; step 2 lists published shop products no stove owns and sets them to draft.
  Released to staging and production.
- Fixed `term_exists` sync failures (brands like "Charlton &amp; Jenrick" were not matched) and the
  sync error now shows WooCommerce's reason for products it cannot save.
- Ran the reset: step 1 done (failures fixed; 25209 and 26127 were blocked by stale SKUs in
  WooCommerce's lookup table and were deleted from the app by the user), step 2 found nothing
  published without a stove. Shop: 96 published = 96 stoves for sale. The reset page and the
  Webshop admin section were removed afterwards.
- Vercel CLI: global install failed on permissions; use `npx -y vercel@63.1.2` (logged in).

## Open items
- Drop the unused `shop_sync_enabled` column in a later migration.
- Test product 100006 is still a draft in WooCommerce; the user can trash it by hand.
- Photos in the stock table load slowly (full-size photos as thumbnails, signed URLs change on every
  render); proposed: store ~300 px thumbnails at upload plus a one-off backfill. Not built yet.
- Web shop orders do not lower the app's stock; the next sync restores the app's stock.
- Not tested: the error screen (needs a release while a page is open) and the ad-first sync timing.
- Consider Vercel Skew Protection so open pages keep working during a release.
- Shop visitors now see the Marktplaats text (title line, price, contact block) on the product page.
- Existing products get the ad text only on their next sync; stoves without an ad get one when edited
  or opened.
- Open items from the 2026-10-01 logs still stand.
