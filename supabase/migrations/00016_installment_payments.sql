-- ============================================================================
-- CUENTAS CLARAS · 00016_installment_payments.sql
-- Que el cierre de tarjeta descuente el resumen completo, no sólo las compras.
--
--  · El problema: el resumen que debita el banco son las compras MÁS las
--    cuotas del mes. El cierre descontaba sólo las compras, así que el saldo
--    del banco quedaba alto por el valor de las cuotas.
--  · No se podían descontar sin más: las cuotas son proyección y no tenían
--    estado de "cobrada", así que tocar dos veces el botón habría descontado
--    dos veces. installment_payments es ese estado: una fila por
--    (cuota, mes), con unique, igual que income_receipts para los ingresos.
--  · La idempotencia sale del "on conflict do nothing ... returning": el
--    segundo cierre no inserta nada, suma cero y no toca el saldo.
-- ============================================================================

create table public.installment_payments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  installment_id uuid not null references public.installments (id) on delete cascade,
  month_year     date not null check (month_year = date_trunc('month', month_year)::date),
  amount         numeric(14,2) not null check (amount > 0),
  created_at     timestamptz not null default now(),
  unique (org_id, installment_id, month_year)  -- una cuota se cobra una vez por mes
);
create index installment_payments_org_month_idx
  on public.installment_payments (org_id, month_year);
comment on table public.installment_payments is
  'Cuotas que ya entraron en un resumen pagado. Evita descontarlas dos veces y saca la cuota de lo pendiente.';

-- ----------------------------------------------------------------------------
-- El cierre pasa a cubrir compras + cuotas
-- ----------------------------------------------------------------------------
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
  v_month   date := date_trunc('month', p_month)::date;
  v_compras numeric;
  v_cuotas  numeric;
  v_total   numeric;
begin
  -- El medio tiene que ser de la familia: si no, no se cierra nada ajeno
  if p_method is not null
     and not exists (select 1 from public.payment_methods
                      where id = p_method
                        and org_id = (select public.current_org_id())) then
    raise exception 'Medio de pago inexistente o de otra cuenta';
  end if;

  -- 1) Las compras del período quedan saldadas
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
  select coalesce(sum(amount), 0) into v_compras from pagadas;

  -- 2) Y las cuotas que vencen ese mes quedan registradas como cobradas.
  --    El on conflict es lo que hace idempotente al botón: si ya estaban,
  --    no se insertan de nuevo ni vuelven a sumar.
  with vencen as (
    select i.id, i.amount_per_installment
    from public.installments i
    where i.org_id = (select public.current_org_id())
      and (p_method is null or i.payment_method_id = p_method)
      and (
        (date_part('year', v_month)  - date_part('year', i.start_date)) * 12
      + (date_part('month', v_month) - date_part('month', i.start_date)) + 1
      )::int between 1 and i.total_installments
  ),
  cobradas as (
    insert into public.installment_payments (org_id, installment_id, month_year, amount)
    select (select public.current_org_id()), v.id, v_month, v.amount_per_installment
    from vencen v
    on conflict (org_id, installment_id, month_year) do nothing
    returning amount
  )
  select coalesce(sum(amount), 0) into v_cuotas from cobradas;

  v_total := v_compras + v_cuotas;

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

-- RLS + Realtime
alter table public.installment_payments enable row level security;

create policy "installment_payments: solo mi familia" on public.installment_payments
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

alter table public.installment_payments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.installment_payments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
