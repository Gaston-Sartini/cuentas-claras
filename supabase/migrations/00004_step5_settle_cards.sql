-- Cierre mensual de tarjetas: marca como pagadas las compras con tarjeta de un
-- mes dado y, opcionalmente, descuenta el total de una billetera (Banco).
--  · SECURITY INVOKER: la RLS del usuario aplica adentro.
--  · Atómica y a prueba de doble toque (total sale del UPDATE ... RETURNING).
--  · p_wallet null = no tocar billeteras.
--  · Billetera ajena/inexistente => aborta todo (rollback).

create or replace function public.settle_card_month(
  p_month  date,
  p_wallet uuid default null
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
  with pagadas as (
    update public.transactions
       set status = 'settled'
     where org_id = (select public.current_org_id())
       and kind = 'expense'
       and status = 'next_month'
       and payment_method in ('mastercard', 'visa')
       and billing_month = v_month
    returning amount
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

revoke all on function public.settle_card_month(date, uuid) from public, anon;
grant execute on function public.settle_card_month(date, uuid) to authenticated;
