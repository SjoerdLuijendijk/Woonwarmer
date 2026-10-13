-- Invoice and quote lines can fall under the margin scheme for used goods ("margeregeling"): such a
-- line shows no VAT (stored as vat_rate 0 with margin_scheme). Lines can also be negative, for a
-- stove taken in part exchange ("Inruilkachel"). Backward compatible: the new column defaults to
-- false and the functions treat a missing margin_scheme as false, as the production code sends it.

alter table public.invoice_lines
  add column margin_scheme boolean not null default false,
  add constraint invoice_lines_margin_scheme_vat_check check (not margin_scheme or vat_rate = 0),
  drop constraint invoice_lines_unit_price_cents_check,
  add constraint invoice_lines_unit_price_cents_check check (unit_price_cents between -100000000 and 100000000);

alter table public.quote_lines
  add column margin_scheme boolean not null default false,
  add constraint quote_lines_margin_scheme_vat_check check (not margin_scheme or vat_rate = 0),
  drop constraint quote_lines_unit_price_cents_check,
  add constraint quote_lines_unit_price_cents_check check (unit_price_cents between -100000000 and 100000000);

create or replace function public.create_invoice(p_stove_number bigint, p_customer jsonb, p_lines jsonb)
returns table (id bigint, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_year integer := extract(year from v_today)::integer;
  v_sequence integer;
  v_invoice_id bigint;
  v_seller jsonb;
  v_line jsonb;
  v_position integer := 0;
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_stove_number is not null and not exists (select 1 from public.stoves s where s.number = p_stove_number) then
    raise exception 'unknown stove' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'invoice needs 1 to 50 lines' using errcode = '22023';
  end if;

  select to_jsonb(c) - 'id' - 'updated_at' into v_seller from public.company_settings c where c.id;
  if v_seller is null then
    raise exception 'company settings missing' using errcode = 'P0002';
  end if;

  update public.invoice_number_counter as counter set last_number = counter.last_number + 1
  where counter.id
  returning counter.last_number into v_sequence;

  insert into public.invoices (
    invoice_year, sequence_number, stove_number, issue_date, seller,
    customer_name, customer_address, customer_postal_code, customer_city, customer_email, customer_phone
  )
  values (
    v_year, v_sequence, p_stove_number, v_today, v_seller,
    p_customer ->> 'name', p_customer ->> 'address', p_customer ->> 'postal_code', p_customer ->> 'city',
    nullif(p_customer ->> 'email', ''), nullif(p_customer ->> 'phone', '')
  )
  returning invoices.id into v_invoice_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price_cents, vat_rate, margin_scheme)
    values (
      v_invoice_id, v_position, v_line ->> 'description', (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price_cents')::bigint, (v_line ->> 'vat_rate')::integer,
      coalesce((v_line ->> 'margin_scheme')::boolean, false)
    );
  end loop;

  return query select i.id, i.invoice_number from public.invoices i where i.id = v_invoice_id;
end;
$$;

revoke execute on function public.create_invoice(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.create_invoice(bigint, jsonb, jsonb) to authenticated;

create or replace function public.save_quote(p_quote_id bigint, p_quote jsonb, p_lines jsonb)
returns table (id bigint, quote_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_year integer := extract(year from v_today)::integer;
  v_sequence integer;
  v_quote_id bigint := p_quote_id;
  v_line jsonb;
  v_position integer := 0;
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'quote needs 1 to 50 lines' using errcode = '22023';
  end if;

  if v_quote_id is null then
    insert into public.quote_counters as counter (quote_year, last_number)
    values (v_year, 1)
    on conflict (quote_year) do update set last_number = counter.last_number + 1
    returning counter.last_number into v_sequence;

    insert into public.quotes (
      quote_year, sequence_number, issue_date, valid_until, customer_name, customer_address,
      customer_postal_code, customer_city, customer_email, customer_phone, notes
    )
    values (
      v_year, v_sequence, v_today, (p_quote ->> 'valid_until')::date, p_quote ->> 'customer_name',
      nullif(p_quote ->> 'customer_address', ''), nullif(p_quote ->> 'customer_postal_code', ''),
      nullif(p_quote ->> 'customer_city', ''), nullif(p_quote ->> 'customer_email', ''),
      nullif(p_quote ->> 'customer_phone', ''), nullif(p_quote ->> 'notes', '')
    )
    returning quotes.id into v_quote_id;
  else
    update public.quotes q set
      valid_until = (p_quote ->> 'valid_until')::date,
      customer_name = p_quote ->> 'customer_name',
      customer_address = nullif(p_quote ->> 'customer_address', ''),
      customer_postal_code = nullif(p_quote ->> 'customer_postal_code', ''),
      customer_city = nullif(p_quote ->> 'customer_city', ''),
      customer_email = nullif(p_quote ->> 'customer_email', ''),
      customer_phone = nullif(p_quote ->> 'customer_phone', ''),
      notes = nullif(p_quote ->> 'notes', ''),
      updated_at = now()
    where q.id = v_quote_id;
    if not found then
      raise exception 'unknown quote' using errcode = 'P0002';
    end if;
    delete from public.quote_lines l where l.quote_id = v_quote_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    insert into public.quote_lines (quote_id, position, description, quantity, unit_price_cents, vat_rate, margin_scheme, stove_number, article_id)
    values (
      v_quote_id, v_position, v_line ->> 'description', (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price_cents')::bigint, (v_line ->> 'vat_rate')::integer,
      coalesce((v_line ->> 'margin_scheme')::boolean, false),
      (v_line ->> 'stove_number')::bigint,
      (select a.id from public.articles a where a.id = (v_line ->> 'article_id')::bigint)
    );
  end loop;

  return query select q.id, q.quote_number from public.quotes q where q.id = v_quote_id;
end;
$$;

revoke execute on function public.save_quote(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote(bigint, jsonb, jsonb) to authenticated;
