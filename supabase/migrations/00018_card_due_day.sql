-- ============================================================================
-- CUENTAS CLARAS · 00018_card_due_day.sql
-- Cuándo vence cada tarjeta, y cuánto se debe de cada una visto del servidor.
--
--  · payment_methods.due_day: el día del mes en que vence el resumen de esa
--    tarjeta ("la Visa vence el 12"). Mismo modelo que recurring_expenses:
--    un día-de-mes y no una fecha, porque el vencimiento vuelve todos los
--    meses. El 31 en un mes corto cae el último día (lo resuelve quien lee).
--  · v_card_statements: cuánto hay que pagar hoy de cada tarjeta, para que el
--    aviso diario (Edge Function send-reminders) pueda decir el monto. Es el
--    espejo en SQL de src/hooks/useCardStatements.js: compras del período que
--    ya venció MÁS las cuotas que caen en esos mismos meses y todavía no
--    quedaron registradas como cobradas. Si una de las dos cambia, la otra
--    tiene que cambiar igual; 14_card_statements_test.sql lo fija.
--  · installment_number(): el "qué número de cuota cae en tal mes" estaba
--    copiado en settle y en unsettle y ahora lo necesitaba también la vista.
--    Vive una sola vez acá y los tres la usan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EL DÍA DE VENCIMIENTO DE LA TARJETA
-- ----------------------------------------------------------------------------
alter table public.payment_methods
  add column due_day int check (due_day is null or due_day between 1 and 31);

comment on column public.payment_methods.due_day is
  'Día del mes en que vence el resumen de la tarjeta (1-31). Null = sin aviso.';

-- ----------------------------------------------------------------------------
-- 2. QUÉ CUOTA CAE EN QUÉ MES (una sola definición para todos)
-- ----------------------------------------------------------------------------
-- Sin "set search_path": es aritmética de fechas, no toca ninguna tabla, y
-- dejándola sin fijar Postgres puede inlinearla dentro de la vista.
create or replace function public.installment_number(p_start date, p_month date)
returns int
language sql
immutable
as $$
  select ((date_part('year',  p_month) - date_part('year',  p_start)) * 12
        + (date_part('month', p_month) - date_part('month', p_start)) + 1)::int;
$$;

comment on function public.installment_number(date, date) is
  'Número de cuota que vence en p_month para un plan que arrancó en p_start (1 = la primera).';

-- ----------------------------------------------------------------------------
-- 3. EL CIERRE Y EL DESHACER PASAN A USAR EL HELPER
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
      and public.installment_number(i.start_date, v_month)
            between 1 and i.total_installments
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

-- ----------------------------------------------------------------------------
-- 4. LA VISTA: CUÁNTO SE DEBE HOY DE CADA TARJETA
-- ----------------------------------------------------------------------------
-- security_invoker: la vista no es una puerta de atrás, aplica la RLS de las
-- tablas de abajo. Cada familia ve sólo sus tarjetas; la Edge Function entra
-- con service role, que saltea RLS, y ve las de todas para avisarle a cada una.
create view public.v_card_statements with (security_invoker = true) as
with vencidos as (
  -- Meses contables ya vencidos (este mes o antes) con compras de crédito sin
  -- pagar: los mismos que toma useCardCharges para armar el resumen.
  select distinct t.org_id, t.billing_month
    from public.transactions t
    join public.payment_methods m
      on m.id = t.payment_method_id and m.kind = 'credit'
   where t.kind = 'expense'
     and t.status = 'next_month'
     and t.billing_month <= date_trunc('month', current_date)::date
),
compras as (
  select t.payment_method_id as method_id, sum(t.amount) as total
    from public.transactions t
    join public.payment_methods m
      on m.id = t.payment_method_id and m.kind = 'credit'
    join vencidos v
      on v.org_id = t.org_id and v.billing_month = t.billing_month
   where t.kind = 'expense'
     and t.status = 'next_month'
   group by 1
),
cuotas as (
  -- Las cuotas que caen en esos meses y todavía no entraron en un resumen
  -- pagado: una vez registradas en installment_payments dejan de deberse.
  select i.payment_method_id as method_id, sum(i.amount_per_installment) as total
    from public.installments i
    join vencidos v on v.org_id = i.org_id
   where public.installment_number(i.start_date, v.billing_month)
           between 1 and i.total_installments
     and not exists (
       select 1 from public.installment_payments p
        where p.installment_id = i.id
          and p.month_year = v.billing_month)
   group by 1
)
select m.org_id,
       m.id   as payment_method_id,
       m.name,
       m.due_day,
       coalesce(c.total, 0) as compras,
       coalesce(q.total, 0) as cuotas,
       coalesce(c.total, 0) + coalesce(q.total, 0) as total
  from public.payment_methods m
  left join compras c on c.method_id = m.id
  left join cuotas  q on q.method_id = m.id
 where m.kind = 'credit'
   and coalesce(c.total, 0) + coalesce(q.total, 0) > 0;

comment on view public.v_card_statements is
  'Lo que falta pagar hoy de cada tarjeta de crédito (compras del período + cuotas no cobradas). Espejo en SQL de src/hooks/useCardStatements.js, para que el aviso diario diga el mismo monto que la pantalla.';
