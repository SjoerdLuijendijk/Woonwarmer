-- Invoice lines remember the stove or article they came from, as quote lines do, so the invoice PDF
-- can show its photo. A deleted article leaves the line without one; the stove number has no foreign
-- key because invoices outlive their stoves. Lines that send neither (the production code until this
-- release) keep both empty. Grants and RLS are unchanged.

alter table public.invoice_lines
  add column stove_number bigint,
  add column article_id bigint references public.articles (id) on delete set null;

create index invoice_lines_article_id_idx on public.invoice_lines (article_id);

create or replace function public.create_invoice(p_stove_number bigint, p_customer jsonb, p_lines jsonb, p_stock_deduction integer)
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

  if p_stock_deduction is null or p_stock_deduction not between 0 and 1000
     or (p_stock_deduction > 0 and p_stove_number is null) then
    raise exception 'invalid stock deduction' using errcode = '22023';
  end if;

  select to_jsonb(c) - 'id' - 'updated_at' into v_seller from public.company_settings c where c.id;
  if v_seller is null then
    raise exception 'company settings missing' using errcode = 'P0002';
  end if;

  -- Made-to-order stoves keep no stock. Taking more units than in stock violates the stock range
  -- check (23514); the sync_stove_stock trigger marks a sold-out stove as sold and unlists it.
  if p_stock_deduction > 0 then
    update public.stoves s set stock_quantity = s.stock_quantity - p_stock_deduction
    where s.number = p_stove_number and not s.made_to_order;
    if not found then
      raise exception 'stove keeps no stock' using errcode = '22023';
    end if;
  end if;

  update public.invoice_number_counter as counter set last_number = counter.last_number + 1
  where counter.id
  returning counter.last_number into v_sequence;

  insert into public.invoices (
    invoice_year, sequence_number, stove_number, issue_date, seller, stock_deducted,
    customer_name, customer_address, customer_postal_code, customer_city, customer_email, customer_phone
  )
  values (
    v_year, v_sequence, p_stove_number, v_today, v_seller, p_stock_deduction,
    p_customer ->> 'name', p_customer ->> 'address', p_customer ->> 'postal_code', p_customer ->> 'city',
    nullif(p_customer ->> 'email', ''), nullif(p_customer ->> 'phone', '')
  )
  returning invoices.id into v_invoice_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price_cents, vat_rate, margin_scheme, stove_number, article_id)
    values (
      v_invoice_id, v_position, v_line ->> 'description', (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price_cents')::bigint, (v_line ->> 'vat_rate')::integer,
      coalesce((v_line ->> 'margin_scheme')::boolean, false),
      (v_line ->> 'stove_number')::bigint,
      (select a.id from public.articles a where a.id = (v_line ->> 'article_id')::bigint)
    );
  end loop;

  return query select i.id, i.invoice_number from public.invoices i where i.id = v_invoice_id;
end;
$$;

revoke execute on function public.create_invoice(bigint, jsonb, jsonb, integer) from public, anon;
grant execute on function public.create_invoice(bigint, jsonb, jsonb, integer) to authenticated;

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
