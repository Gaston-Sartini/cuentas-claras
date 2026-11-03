-- ============================================================================
-- CUENTAS CLARAS · 00020_dolares.sql
-- Gastos en dólares y el tipo de cambio de la familia.
--
--  · El resumen del banco trae dos saldos separados, uno en pesos y otro en
--    dólares ("SALDO ACTUAL $ 943.776,48 / SALDO ACTUAL U$S 69,15"), y los
--    cobra por separado. La app los guarda igual: no se mezclan.
--  · amount_usd: cuando está cargado, ese gasto vino en dólares y amount
--    tiene su equivalente en pesos al cambio vigente. Así todo lo que ya
--    sumaba pesos (billeteras, topes, historial, proyección) sigue andando
--    sin enterarse de que existen los dólares.
--  · organizations.usd_rate: a cuánto toma la familia el dólar. Cambiarlo
--    recotiza lo que todavía no se pagó; lo ya pagado queda como quedó,
--    porque eso es lo que pasó de verdad.
--  · Las cuotas quedan sólo en pesos a propósito: el banco cobra las compras
--    en dólares en un pago.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EL DÓLAR DE LA FAMILIA
-- ----------------------------------------------------------------------------
alter table public.organizations
  add column usd_rate numeric(12,2) not null default 1000
  check (usd_rate > 0);

comment on column public.organizations.usd_rate is
  'A cuánto toma la familia el dólar para pasar a pesos lo que viene en dólares.';

-- ----------------------------------------------------------------------------
-- 2. EL GASTO QUE VINO EN DÓLARES
-- ----------------------------------------------------------------------------
alter table public.transactions
  add column amount_usd numeric(14,2)
  check (amount_usd is null or amount_usd > 0);

comment on column public.transactions.amount_usd is
  'Si está cargado, el gasto vino en dólares y amount es su equivalente en pesos.';

alter table public.recurring_expenses
  add column amount_usd numeric(14,2)
  check (amount_usd is null or amount_usd > 0);

comment on column public.recurring_expenses.amount_usd is
  'Si está cargado, el fijo se cobra en dólares (Netflix, Claude...) y amount es su equivalente en pesos.';

-- ----------------------------------------------------------------------------
-- 3. CAMBIAR EL DÓLAR RECOTIZA LO QUE FALTA PAGAR
-- ----------------------------------------------------------------------------
create or replace function public.set_usd_rate(p_rate numeric)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := (select public.current_org_id());
begin
  if p_rate is null or p_rate <= 0 then
    raise exception 'El dólar tiene que ser mayor a cero';
  end if;

  update public.organizations set usd_rate = p_rate where id = v_org;
  if not found then
    raise exception 'Familia inexistente';
  end if;

  -- Lo que todavía no se pagó se recotiza: es una previsión de lo que va a
  -- venir, y tiene que seguir al dólar de hoy.
  update public.transactions
     set amount = round(amount_usd * p_rate, 2)
   where org_id = v_org
     and amount_usd is not null
     and status = 'next_month';

  -- Los fijos son siempre proyección: se recotizan todos.
  update public.recurring_expenses
     set amount = round(amount_usd * p_rate, 2)
   where org_id = v_org
     and amount_usd is not null;

  return p_rate;
end;
$$;

revoke all on function public.set_usd_rate(numeric) from public, anon;
grant execute on function public.set_usd_rate(numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. LA VISTA SEPARA PESOS DE DÓLARES
-- ----------------------------------------------------------------------------
-- `compras` y `cuotas` son pesos de verdad; `usd` son dólares de verdad. El
-- total en pesos de todo junto (`total_ars`) sale recién al final, al cambio
-- de la familia: es lo que el aviso y la pantalla muestran como "te va a
-- salir tanto".
create or replace view public.v_card_statements with (security_invoker = true) as
with compras as (
  select t.payment_method_id as method_id,
         coalesce(sum(t.amount) filter (where t.amount_usd is null), 0)   as pesos,
         coalesce(sum(t.amount_usd) filter (where t.amount_usd is not null), 0) as usd
    from public.transactions t
    join public.payment_methods m
      on m.id = t.payment_method_id and m.kind = 'credit'
   where t.kind = 'expense'
     and t.status = 'next_month'
     and t.billing_month <= date_trunc('month', current_date)::date
   group by 1
),
cuotas as (
  select i.payment_method_id as method_id, sum(i.amount_per_installment) as total
    from public.installments i
    cross join lateral (
      select gs::date as mes
        from generate_series(
               date_trunc('month', i.start_date)::date,
               date_trunc('month', current_date)::date,
               interval '1 month') gs
    ) v
   where public.installment_number(i.start_date, v.mes)
           between 1 and i.total_installments
     and not exists (
       select 1 from public.installment_payments p
        where p.installment_id = i.id
          and p.month_year = v.mes)
   group by 1
)
select m.org_id,
       m.id   as payment_method_id,
       m.name,
       m.due_day,
       coalesce(c.pesos, 0) as compras,
       coalesce(q.total, 0) as cuotas,
       coalesce(c.pesos, 0) + coalesce(q.total, 0) as total,
       coalesce(c.usd, 0)   as usd,
       o.usd_rate,
       coalesce(c.pesos, 0) + coalesce(q.total, 0)
         + round(coalesce(c.usd, 0) * o.usd_rate, 2) as total_ars
  from public.payment_methods m
  join public.organizations o on o.id = m.org_id
  left join compras c on c.method_id = m.id
  left join cuotas  q on q.method_id = m.id
 where m.kind = 'credit'
   and (coalesce(c.pesos, 0) + coalesce(q.total, 0) > 0 or coalesce(c.usd, 0) > 0);

comment on view public.v_card_statements is
  'Lo que falta pagar de cada tarjeta: compras y cuotas en pesos, consumos en dólares aparte, y total_ars con los dólares pasados al cambio de la familia. Espejo en SQL de src/hooks/useCardStatements.js.';
