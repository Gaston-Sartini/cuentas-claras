-- ============================================================================
-- CUENTAS CLARAS · 00015_settle_one_card.sql
-- Cerrar el resumen de UNA tarjeta, no de todas juntas.
--
--  · Una familia con varias tarjetas paga un resumen hoy y el otro la semana
--    que viene. Hasta ahora "Ya la pagué" marcaba todas las del mes de una.
--  · p_method null => todas (como antes, y es lo que usa el botón "pagar
--    todo"); p_method con un medio de pago => sólo esa tarjeta.
--  · Las filas viejas con el enum legacy (payment_method_id null) no se
--    pueden cerrar de a una: no tienen a qué medio apuntar. Entran igual en
--    el cierre de todas. En la práctica no quedan: 00005 las backfilleó.
--  · Hay que dropear la versión de 2 argumentos: si no, llamarla con dos
--    queda ambiguo contra la nueva (que tiene el tercero con default).
-- ============================================================================

drop function if exists public.settle_card_month(date, uuid);

create or replace function public.settle_card_month(
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
  v_month date := date_trunc('month', p_month)::date;
  v_total numeric;
begin
  -- El medio tiene que ser de la familia: si no, no se cierra nada ajeno
  if p_method is not null
     and not exists (select 1 from public.payment_methods
                      where id = p_method
                        and org_id = (select public.current_org_id())) then
    raise exception 'Medio de pago inexistente o de otra cuenta';
  end if;

  with pagadas as (
    update public.transactions t
       set status = 'settled'
     where t.org_id = (select public.current_org_id())
       and t.kind = 'expense'
       and t.status = 'next_month'
       and (
         t.payment_method in ('mastercard', 'visa')
         or exists (select 1 from public.payment_methods m
                     where m.id = t.payment_method_id and m.kind = 'credit')
       )
       and t.billing_month = v_month
       and (p_method is null or t.payment_method_id = p_method)
    returning t.amount
  )
  select coalesce(sum(amount), 0) into v_total from pagadas;

  if v_total > 0 and p_wallet is not null then
    update public.wallets
       set current_balance = current_balance - v_total,
           updated_at = now()
     where id = p_wallet;

    if not found then
      raise exception 'Billetera inexistente o de otra cuenta';
    end if;
  end if;

  return v_total;
end;
$$;

revoke all on function public.settle_card_month(date, uuid, uuid) from public, anon;
grant execute on function public.settle_card_month(date, uuid, uuid) to authenticated;
