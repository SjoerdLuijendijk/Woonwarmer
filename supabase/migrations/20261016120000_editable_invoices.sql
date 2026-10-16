-- Invoices are not sent from the app yet, so the team can still correct the customer and the lines of
-- an invoice. The number, issue date, seller details, stove and stock deduction stay as they were
-- created; changing the lines does not change the stock. The invoice remembers who changed it last.
-- Backward compatible: new nullable columns and a new function that the production code does not call.

alter table public.invoices
  add column updated_at timestamptz,
  add column updated_by uuid references auth.users (id) on delete set null;

create function public.update_invoice(p_invoice_id bigint, p_customer jsonb, p_lines jsonb)
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
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price_cents, vat_rate, margin_scheme)
    values (
      p_invoice_id, v_position, v_line ->> 'description', (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price_cents')::bigint, (v_line ->> 'vat_rate')::integer,
      coalesce((v_line ->> 'margin_scheme')::boolean, false)
    );
  end loop;

  return query select i.id, i.invoice_number from public.invoices i where i.id = p_invoice_id;
end;
$$;

revoke execute on function public.update_invoice(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.update_invoice(bigint, jsonb, jsonb) to authenticated;
