-- Invoices start as a draft (concept): no number, still editable, deletable. Marking one sent makes
-- it final: it gets the next number, today's date and the current seller details, the stove's sold
-- units leave the stock, and it can no longer be changed. Every existing invoice has a number and
-- counts as sent.
--
-- Backward compatible for the minutes until the new code is live: create_invoice() (the production
-- code's "Factuur maken") keeps making final invoices. update_invoice() now refuses final invoices,
-- which the production code still offers for a moment; it then shows its general error.

alter table public.invoices
  add column status text not null default 'sent' check (status in ('draft', 'sent')),
  add column sent_at timestamptz,
  alter column sequence_number drop not null,
  alter column invoice_year drop not null,
  add constraint invoices_draft_number_check check ((status = 'draft') = (sequence_number is null));

update public.invoices set sent_at = created_at where status = 'sent';

-- Saves a draft: a new one (p_invoice_id null) or the changed customer and lines of an existing draft.
create function public.save_draft_invoice(p_invoice_id bigint, p_stove_number bigint, p_customer jsonb, p_lines jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id bigint := p_invoice_id;
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
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

  if v_invoice_id is null then
    insert into public.invoices (
      status, stove_number, issue_date, seller,
      customer_name, customer_address, customer_postal_code, customer_city, customer_email, customer_phone
    )
    values (
      'draft', p_stove_number, v_today, v_seller,
      p_customer ->> 'name', p_customer ->> 'address', p_customer ->> 'postal_code', p_customer ->> 'city',
      nullif(p_customer ->> 'email', ''), nullif(p_customer ->> 'phone', '')
    )
    returning id into v_invoice_id;
  else
    update public.invoices i set
      stove_number = p_stove_number,
      issue_date = v_today,
      seller = v_seller,
      customer_name = p_customer ->> 'name',
      customer_address = p_customer ->> 'address',
      customer_postal_code = p_customer ->> 'postal_code',
      customer_city = p_customer ->> 'city',
      customer_email = nullif(p_customer ->> 'email', ''),
      customer_phone = nullif(p_customer ->> 'phone', ''),
      updated_at = now(),
      updated_by = auth.uid()
    where i.id = v_invoice_id and i.status = 'draft';
    if not found then
      raise exception 'not a draft' using errcode = '22023';
    end if;
    delete from public.invoice_lines l where l.invoice_id = v_invoice_id;
  end if;

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

  return v_invoice_id;
end;
$$;

revoke execute on function public.save_draft_invoice(bigint, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_draft_invoice(bigint, bigint, jsonb, jsonb) to authenticated;

-- Marks a draft sent: the next number, today's date, the current seller details, and the stove's sold
-- units off the stock, all in one transaction.
create function public.finalize_invoice(p_invoice_id bigint, p_stock_deduction integer)
returns table (id bigint, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_stove_number bigint;
  v_sequence integer;
  v_seller jsonb;
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Locks the draft, so it is finalized once even when two people click at the same time.
  select i.stove_number into v_stove_number from public.invoices i where i.id = p_invoice_id and i.status = 'draft' for update;
  if not found then
    raise exception 'not a draft' using errcode = '22023';
  end if;

  if p_stock_deduction is null or p_stock_deduction not between 0 and 1000
     or (p_stock_deduction > 0 and v_stove_number is null) then
    raise exception 'invalid stock deduction' using errcode = '22023';
  end if;

  select to_jsonb(c) - 'id' - 'updated_at' into v_seller from public.company_settings c where c.id;
  if v_seller is null then
    raise exception 'company settings missing' using errcode = 'P0002';
  end if;

  -- As in create_invoice: made-to-order stoves keep no stock; too few units violate the stock check.
  if p_stock_deduction > 0 then
    update public.stoves s set stock_quantity = s.stock_quantity - p_stock_deduction
    where s.number = v_stove_number and not s.made_to_order;
    if not found then
      raise exception 'stove keeps no stock' using errcode = '22023';
    end if;
  end if;

  update public.invoice_number_counter as counter set last_number = counter.last_number + 1
  where counter.id
  returning counter.last_number into v_sequence;

  update public.invoices i set
    status = 'sent',
    sent_at = now(),
    sequence_number = v_sequence,
    invoice_year = extract(year from v_today)::integer,
    issue_date = v_today,
    seller = v_seller,
    stock_deducted = p_stock_deduction
  where i.id = p_invoice_id;

  return query select i.id, i.invoice_number from public.invoices i where i.id = p_invoice_id;
end;
$$;

revoke execute on function public.finalize_invoice(bigint, integer) from public, anon;
grant execute on function public.finalize_invoice(bigint, integer) to authenticated;

-- Deletes a draft; a sent invoice is never deleted.
create function public.delete_draft_invoice(p_invoice_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.invoices i where i.id = p_invoice_id and i.status = 'draft';
  if not found then
    raise exception 'not a draft' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.delete_draft_invoice(bigint) from public, anon;
grant execute on function public.delete_draft_invoice(bigint) to authenticated;

-- Sent invoices are final.
create or replace function public.update_invoice(p_invoice_id bigint, p_customer jsonb, p_lines jsonb)
returns table (id bigint, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  raise exception 'sent invoice' using errcode = '22023';
end;
$$;

revoke execute on function public.update_invoice(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.update_invoice(bigint, jsonb, jsonb) to authenticated;
