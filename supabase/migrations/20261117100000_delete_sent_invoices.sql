-- Sent invoices of the app can be deleted too, not only drafts. Deleting takes the lines and the
-- payments along. When the deleted invoice holds the last number handed out, the number is freed, so
-- the next invoice gets it and the series has no gap; an older number leaves a gap. On request the
-- units the invoice took from the stock of its stove go back.
--
-- Web shop invoices stay: the shop numbered them and the next import would bring them back.
--
-- Backward compatible: delete_draft_invoice(), which the production code calls, is unchanged.

create function public.delete_invoice(p_invoice_id bigint, p_restore_stock boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_stock_restored boolean := false;
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Locks the invoice, so it is deleted (and its stock put back) once.
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found then
    raise exception 'unknown invoice' using errcode = 'P0002';
  end if;
  if v_invoice.source <> 'app' then
    raise exception 'shop invoice' using errcode = '22023';
  end if;

  -- A used stove is a single unit, also when it was put back in stock by hand in the meantime.
  if coalesce(p_restore_stock, false) and v_invoice.stock_deducted > 0 and v_invoice.stove_number is not null then
    update public.stoves s
    set stock_quantity = least(s.stock_quantity + v_invoice.stock_deducted, case when s.condition = 'used' then 1 else 10000 end)
    where s.number = v_invoice.stove_number and not s.made_to_order;
    v_stock_restored := found;
  end if;

  delete from public.invoices i where i.id = p_invoice_id;

  -- Updating the counter locks it, so an invoice being finalized at the same time waits for this.
  if v_invoice.sequence_number is not null then
    update public.invoice_number_counter as counter set last_number = counter.last_number - 1
    where counter.id and counter.last_number = v_invoice.sequence_number;
  end if;

  return v_stock_restored;
end;
$$;

revoke execute on function public.delete_invoice(bigint, boolean) from public, anon;
grant execute on function public.delete_invoice(bigint, boolean) to authenticated;
