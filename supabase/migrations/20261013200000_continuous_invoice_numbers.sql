-- Invoices continue the numbering of the invoices made before the app (the last one was 297): one
-- continuous series (298, 299, ...) instead of a series per year (2026-0001). Only possible while
-- the app has no invoices yet, because issued numbers never change; the migration stops otherwise.
-- Also adds the small print printed at the bottom of every invoice, set under Bedrijfsgegevens.
-- Backward compatible: create_invoice() keeps its signature and production code only reads
-- invoice_number as text and does not select invoice_footer.

do $$
begin
  if exists (select 1 from public.invoices) then
    raise exception 'invoices already exist; their numbers must not change';
  end if;
end;
$$;

alter table public.invoices drop column invoice_number;
alter table public.invoices drop constraint invoices_invoice_year_sequence_number_key;
alter table public.invoices add constraint invoices_sequence_number_key unique (sequence_number);
alter table public.invoices add column invoice_number text generated always as (sequence_number::text) stored unique;

-- A single row holding the last number handed out. Updating it locks the row, so concurrent
-- invoices wait for each other and no number is skipped or used twice.
create table public.invoice_number_counter (
  id boolean primary key default true check (id),
  last_number integer not null check (last_number >= 0)
);
alter table public.invoice_number_counter enable row level security;
revoke all on public.invoice_number_counter from anon, authenticated;
insert into public.invoice_number_counter (id, last_number) values (true, 297);

drop table public.invoice_counters;

alter table public.company_settings
  add column invoice_footer text check (char_length(invoice_footer) <= 2000);

update public.company_settings set invoice_footer =
  'Onze producten vallen onder de margeregeling. Dit houdt in dat wij btw betalen over de winstmarge en niet over de volledige verkoopprijs. Op alle verkopen zijn onze algemene voorwaarden van toepassing.' || chr(10) ||
  'Op de kachelruit en het binnenwerk van de kachel kunnen wij helaas geen garantie verlenen, omdat deze onderdelen door gebruik en warmte aan slijtage onderhevig zijn. We adviseren om hier zorgvuldig mee om te gaan, zodat u er zo lang mogelijk plezier van heeft. Wij wensen u veel plezier met de kachel!';

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
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price_cents, vat_rate)
    values (
      v_invoice_id, v_position, v_line ->> 'description', (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price_cents')::bigint, (v_line ->> 'vat_rate')::integer
    );
  end loop;

  return query select i.id, i.invoice_number from public.invoices i where i.id = v_invoice_id;
end;
$$;

revoke execute on function public.create_invoice(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.create_invoice(bigint, jsonb, jsonb) to authenticated;
