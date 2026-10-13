# 2026-10-13 14:21 – macbook-air

Branch: `feature/shop-ad-description`

## Done
- The stove's Marktplaats ad text is now sent to WooCommerce as the product description (falls back
  to the stove's own description), so the shop's GoedGeplaatst connector (GoStockr) can forward it
  to Marktplaats. The product is synced again whenever a new ad is stored (background, regenerate,
  manual edit). "Alles uit webshop ophalen" no longer copies the description back for stoves with
  an ad. Released to staging and production.

## Open items
- Not tested in the browser or against the shop: check one stove in WooCommerce and in GoedGeplaatst.
- Assumed from GoStockr's docs that the connector uses the full product description; not verified.
- Shop visitors now see the Marktplaats text (title line, price, contact block) on the product page.
- Existing products get the ad text only on their next sync; stoves without an ad get one when edited
  or opened.
- Open items from the 2026-10-01 logs still stand.
