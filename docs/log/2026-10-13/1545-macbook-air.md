# 2026-10-13 15:45 – macbook-air

Branch: `feature/have-catalog-import` (worktree `../Testomgeving-have-import`, because another
session worked in the main checkout at the same time)

## Done
- Instellingen → Catalogus importeren: imports HAVÉ Verwarming's product export (CSV) as
  made-to-order stoves, one product per Server Action, then syncs each to the shop. Selection: wood
  and bio-ethanol, enabled, not "Uitlopend" (426 of 1,234 on 2026-10-13). Max. 5 photos, HAVÉ's text
  without links and without paragraphs about HAVÉ's Experience Center / kenniscentrum. Matched on
  supplier + SKU, so a newer export updates prices and details. See docs/supplier-catalog.md.
- New optional "Productnaam" (`shop_name`) is the web shop name; without it: brand plus type.
- Sizes and flue details are optional for made-to-order stoves.
- Catalogue stoves without an ad do not get an AI ad in the background when edited.

## Decisions
- User: import HAVÉ's catalogue into the app (not HAVÉ's WordPress plugin), under "Op bestelling".
- Prices: HAVÉ's "Adviesprijs incl. BTW" as is (checked on three product pages).
- New products go online in the shop right away (checkbox, on by default); HAVÉ's description text.
- `product_name` is not reused: shop-imported stoves still hold old shop titles there.

## Open items
- Test on the preview with a 3-product CSV, then release and run the full import (est. 1–3 hours,
  not measured; the page must stay open).
- Unanswered: does GoedGeplaatst forward every shop product to Marktplaats (426 ads)?
- The stock page loads all stoves and photos at once; with ~550 stoves it gets heavier, and
  PostgREST returns at most 1,000 rows by default.
- Products HAVÉ later drops stay in the app; remove them by hand.

## Manual steps and migrations
- `20261013170000_add_stove_shop_name_and_supplier.sql`: applied by the user in the SQL Editor
  (verification query handed over, result not yet confirmed).
