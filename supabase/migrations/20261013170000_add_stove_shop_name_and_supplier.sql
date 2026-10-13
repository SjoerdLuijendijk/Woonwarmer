-- Stoves imported from a supplier's catalogue (Instellingen → Catalogus importeren) remember the
-- supplier and its article number, so importing a newer export updates them instead of adding
-- duplicates. shop_name is an optional web shop name ("Productnaam", e.g. "Dovre Sense 303");
-- without it the name stays brand plus stove type. The older product_name column is not reused:
-- stoves once imported from the shop still hold their former shop titles there.
-- Additive only: the code in production does not read these columns.
alter table public.stoves
  add column shop_name text check (char_length(shop_name) between 1 and 100),
  add column supplier text check (char_length(supplier) between 1 and 100),
  add column supplier_sku text check (char_length(supplier_sku) between 1 and 100),
  add constraint stoves_supplier_sku_pair check ((supplier is null) = (supplier_sku is null)),
  add constraint stoves_supplier_sku_unique unique (supplier, supplier_sku);

grant insert (shop_name), update (shop_name) on public.stoves to authenticated;
-- Set once when the stove is imported; never changed afterwards.
grant insert (supplier, supplier_sku) on public.stoves to authenticated;
