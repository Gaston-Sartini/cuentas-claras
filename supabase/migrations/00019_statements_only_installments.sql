-- ============================================================================
-- CUENTAS CLARAS · 00019_statements_only_installments.sql
-- Una tarjeta cuyo resumen es puras cuotas también está sin pagar.
--
--  · El problema, visto en la vida real: se pagaron cuatro tarjetas y la
--    quinta —cuyo resumen de octubre eran dos cuotas y ninguna compra— se
--    cayó sola de "Tarjetas para pagar" sin que nadie la hubiera pagado.
--  · La causa: la vista preguntaba primero "¿qué meses tienen compras sin
--    pagar?" y recién dentro de esos meses buscaba las cuotas. Al pagar la
--    última compra del mes ese conjunto quedó vacío, y con él se fueron las
--    cuotas de todas las tarjetas, cobradas o no.
--  · El arreglo: las compras y las cuotas se miran por separado. Una cuota se
--    debe si venció (su mes es el actual o anterior) y no quedó registrada en
--    installment_payments, sin importar si ese mes tiene compras o no.
--  · Mismo cambio en src/hooks/useCardStatements.js, que es el espejo en el
--    cliente; 14_card_statements_test.sql fija las dos reglas.
-- ============================================================================

create or replace view public.v_card_statements with (security_invoker = true) as
with compras as (
  -- Compras de un resumen que ya venció y todavía no se pagaron
  select t.payment_method_id as method_id, sum(t.amount) as total
    from public.transactions t
    join public.payment_methods m
      on m.id = t.payment_method_id and m.kind = 'credit'
   where t.kind = 'expense'
     and t.status = 'next_month'
     and t.billing_month <= date_trunc('month', current_date)::date
   group by 1
),
cuotas as (
  -- Cuotas que vencieron y no quedaron registradas como cobradas. Se recorren
  -- los meses del plan hasta el actual: no dependen de que ese mes tenga
  -- compras, que es justamente lo que hacía desaparecer a la tarjeta.
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
       coalesce(c.total, 0) as compras,
       coalesce(q.total, 0) as cuotas,
       coalesce(c.total, 0) + coalesce(q.total, 0) as total
  from public.payment_methods m
  left join compras c on c.method_id = m.id
  left join cuotas  q on q.method_id = m.id
 where m.kind = 'credit'
   and coalesce(c.total, 0) + coalesce(q.total, 0) > 0;

comment on view public.v_card_statements is
  'Lo que falta pagar hoy de cada tarjeta de crédito: compras de resúmenes vencidos sin pagar + cuotas vencidas sin cobrar. Espejo en SQL de src/hooks/useCardStatements.js, para que el aviso diga el mismo monto que la pantalla.';
