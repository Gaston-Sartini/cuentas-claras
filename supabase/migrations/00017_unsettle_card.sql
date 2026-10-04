-- ============================================================================
-- CUENTAS CLARAS · 00017_unsettle_card.sql
-- Deshacer el cierre de una tarjeta.
--
--  · Pasó en la vida real: alguien tocó "Ya la pagué" sin querer y no había
--    forma de volver atrás desde la app. Es el espejo exacto de
--    settle_card_month: las compras vuelven a pendientes, las cuotas dejan de
--    estar cobradas y la billetera recupera la suma de las dos.
--  · Devuelve lo que se repuso, para poder avisarlo en pantalla.
-- ============================================================================

create or replace function public.unsettle_card_month(
  p_month  date,
  p_wallet uuid default null,
  p_method uuid default null
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_month   date := date_trunc('month', p_month)::date;
  v_compras numeric;
  v_cuotas  numeric;
  v_total   numeric;
begin
  if p_method is not null
     and not exists (select 1 from public.payment_methods
                      where id = p_method
                        and org_id = (select public.current_org_id())) then
    raise exception 'Medio de pago inexistente o de otra cuenta';
  end if;

  -- 1) Las compras vuelven a la cuenta del mes
  with devueltas as (
    update public.transactions t
       set status = 'next_month'
     where t.org_id = (select public.current_org_id())
       and t.kind = 'expense'
       and t.status = 'settled'
       and (
         t.payment_method in ('mastercard', 'visa')
         or exists (select 1 from public.payment_methods m
                     where m.id = t.payment_method_id and m.kind = 'credit')
       )
       and t.billing_month = v_month
       and (p_method is null or t.payment_method_id = p_method)
    returning t.amount
  )
  select coalesce(sum(amount), 0) into v_compras from devueltas;

  -- 2) Y las cuotas dejan de estar cobradas
  with descobradas as (
    delete from public.installment_payments p
     where p.org_id = (select public.current_org_id())
       and p.month_year = v_month
       and (
         p_method is null
         or exists (select 1 from public.installments i
                     where i.id = p.installment_id and i.payment_method_id = p_method)
       )
    returning p.amount
  )
  select coalesce(sum(amount), 0) into v_cuotas from descobradas;

  v_total := v_compras + v_cuotas;

  if v_total > 0 and p_wallet is not null then
    update public.wallets
       set current_balance = current_balance + v_total,
           updated_at = now()
     where id = p_wallet;

    if not found then
      raise exception 'Billetera inexistente o de otra cuenta';
    end if;
  end if;

  return v_total;
end;
$$;

revoke all on function public.unsettle_card_month(date, uuid, uuid) from public, anon;
grant execute on function public.unsettle_card_month(date, uuid, uuid) to authenticated;
