-- Payments per invoice and a "paid" mark, and the web shop's invoices of 2026 in the same list.
--
-- Payments: any number of (part) payments per invoice. An invoice counts as paid when it is marked
-- paid (paid_at) or its payments cover the total; the app works this out, nothing is stored twice.
--
-- Web shop invoices: until the app took over invoicing, the shop's PDF invoice plugin numbered the
-- invoices (up to 297; the app continues at 298). import_shop_invoice() stores one of them with its
-- own number, once per shop order. They are read-only: update_invoice() refuses them.
--
-- Backward compatible: new columns have defaults, the new table and functions are not used by the
-- production code, and update_invoice() only gains a check for web shop invoices.

alter table public.invoices
  add column source text not null default 'app' check (source in ('app', 'webshop')),
  add column shop_order_id bigint unique,
  add column paid_at timestamptz,
  add constraint invoices_shop_order_check check ((source = 'webshop') = (shop_order_id is not null));

-- Marking an invoice paid (or not) is the only change clients make to an invoice directly.
grant update (paid_at) on public.invoices to authenticated;
create policy "invoices update paid" on public.invoices for update to authenticated
  using ((select public.is_team_member()))
  with check ((select public.is_team_member()));

create table public.invoice_payments (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.invoices (id) on delete cascade,
  paid_on date not null,
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  method text not null check (method in ('cash', 'pin', 'bank', 'online')),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index invoice_payments_invoice_id_idx on public.invoice_payments (invoice_id);

alter table public.invoice_payments enable row level security;
revoke all on public.invoice_payments from anon, authenticated;
grant select, insert, delete on public.invoice_payments to authenticated;

create policy "invoice_payments select" on public.invoice_payments for select to authenticated
  using ((select public.is_team_member()));
create policy "invoice_payments insert" on public.invoice_payments for insert to authenticated
  with check ((select public.is_team_member()));
create policy "invoice_payments delete" on public.invoice_payments for delete to authenticated
  using ((select public.is_team_member()));

-- Stores one web shop invoice with its own number. Returns the invoice id, or null when the order
-- was imported before. p_paid_on: the shop's payment date, stored as one payment of the total.
create function public.import_shop_invoice(
  p_order_id bigint,
  p_number integer,
  p_issue_date date,
  p_customer jsonb,
  p_lines jsonb,
  p_paid_on date,
  p_payment_method text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id bigint;
  v_seller jsonb;
  v_line jsonb;
  v_position integer := 0;
  v_total bigint := 0;
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if exists (select 1 from public.invoices i where i.shop_order_id = p_order_id) then
    return null;
  end if;

  -- Only numbers the shop handed out before the app took over, so they never meet the app's own.
  if p_number is null or p_number < 1 or p_number > (select c.last_number from public.invoice_number_counter c where c.id) then
    raise exception 'invoice number outside the shop range' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'invoice needs 1 to 50 lines' using errcode = '22023';
  end if;

  if p_paid_on is not null and (p_payment_method is null or p_payment_method not in ('cash', 'pin', 'bank', 'online')) then
    raise exception 'invalid payment method' using errcode = '22023';
  end if;

  select to_jsonb(c) - 'id' - 'updated_at' into v_seller from public.company_settings c where c.id;
  if v_seller is null then
    raise exception 'company settings missing' using errcode = 'P0002';
  end if;

  insert into public.invoices (
    invoice_year, sequence_number, stove_number, issue_date, seller, source, shop_order_id,
    customer_name, customer_address, customer_postal_code, customer_city, customer_email, customer_phone
  )
  values (
    extract(year from p_issue_date)::integer, p_number, null, p_issue_date, v_seller, 'webshop', p_order_id,
    p_customer ->> 'name', p_customer ->> 'address', p_customer ->> 'postal_code', p_customer ->> 'city',
    nullif(p_customer ->> 'email', ''), nullif(p_customer ->> 'phone', '')
  )
  returning id into v_invoice_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price_cents, vat_rate, margin_scheme)
    values (
      v_invoice_id, v_position, v_line ->> 'description', (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price_cents')::bigint, (v_line ->> 'vat_rate')::integer,
      coalesce((v_line ->> 'margin_scheme')::boolean, false)
    );
    v_total := v_total + (v_line ->> 'quantity')::bigint * (v_line ->> 'unit_price_cents')::bigint;
  end loop;

  if p_paid_on is not null and v_total > 0 then
    insert into public.invoice_payments (invoice_id, paid_on, amount_cents, method, note)
    values (v_invoice_id, p_paid_on, v_total, p_payment_method, 'Betaald in de webshop');
  end if;

  return v_invoice_id;
end;
$$;

revoke execute on function public.import_shop_invoice(bigint, integer, date, jsonb, jsonb, date, text) from public, anon;
grant execute on function public.import_shop_invoice(bigint, integer, date, jsonb, jsonb, date, text) to authenticated;

-- Web shop invoices are kept as the shop issued them.
create or replace function public.update_invoice(p_invoice_id bigint, p_customer jsonb, p_lines jsonb)
returns table (id bigint, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_line jsonb;
  v_position integer := 0;
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if exists (select 1 from public.invoices i where i.id = p_invoice_id and i.source = 'webshop') then
    raise exception 'web shop invoice' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'invoice needs 1 to 50 lines' using errcode = '22023';
  end if;

  update public.invoices i set
    customer_name = p_customer ->> 'name',
    customer_address = p_customer ->> 'address',
    customer_postal_code = p_customer ->> 'postal_code',
    customer_city = p_customer ->> 'city',
    customer_email = nullif(p_customer ->> 'email', ''),
    customer_phone = nullif(p_customer ->> 'phone', ''),
    updated_at = now(),
    updated_by = auth.uid()
  where i.id = p_invoice_id;
  if not found then
    raise exception 'unknown invoice' using errcode = 'P0002';
  end if;

  delete from public.invoice_lines l where l.invoice_id = p_invoice_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price_cents, vat_rate, margin_scheme, stove_number, article_id)
    values (
      p_invoice_id, v_position, v_line ->> 'description', (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price_cents')::bigint, (v_line ->> 'vat_rate')::integer,
      coalesce((v_line ->> 'margin_scheme')::boolean, false),
      (v_line ->> 'stove_number')::bigint,
      (select a.id from public.articles a where a.id = (v_line ->> 'article_id')::bigint)
    );
  end loop;

  return query select i.id, i.invoice_number from public.invoices i where i.id = p_invoice_id;
end;
$$;

revoke execute on function public.update_invoice(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.update_invoice(bigint, jsonb, jsonb) to authenticated;
