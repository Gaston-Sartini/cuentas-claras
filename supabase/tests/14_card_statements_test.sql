\set ON_ERROR_STOP on

-- ============ Vencimiento de la tarjeta + v_card_statements ============
-- Reusa la familia 1 (Norma) y la familia 2 (Vecino) de 01_smoke_test.sql.
--
-- La vista mira el mes en curso y los anteriores, así que el test trabaja con
-- tarjetas propias ("Tarjeta Venc" / "Tarjeta Vista") y afirma sobre esas
-- filas: lo que hayan dejado los otros tests en el mes no lo molesta.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset
select id as u2_id from auth.users where email = 'vecino@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

-- ---------------------------------------------------------------- due_day ---
-- 1) Una tarjeta puede guardar el día en que vence su resumen
insert into public.payment_methods (org_id, name, kind, due_day)
values ((select public.current_org_id()), 'Tarjeta Venc', 'credit', 12);

select public.t_assert(
  (select due_day from public.payment_methods where name = 'Tarjeta Venc') = 12,
  'la tarjeta guarda el día en que vence el resumen');

-- 2) Y sólo días que existen en un mes
do $$
begin
  insert into public.payment_methods (org_id, name, kind, due_day)
  values ((select public.current_org_id()), 'Dia cero', 'credit', 0);
  raise exception 'entró un día de vencimiento 0';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.payment_methods (org_id, name, kind, due_day)
  values ((select public.current_org_id()), 'Dia 32', 'credit', 32);
  raise exception 'entró un día de vencimiento 32';
exception
  when check_violation then null;
end $$;

select public.t_assert(true, 'el día de vencimiento va de 1 a 31');

-- 3) Sin día cargado también es válido: esa tarjeta simplemente no avisa
select public.t_assert(
  (select due_day from public.payment_methods where name = 'Visa') is null,
  'una tarjeta sin día de vencimiento es válida (no avisa)');

-- -------------------------------------------------------- v_card_statements -
select id as card_id from public.payment_methods where name = 'Tarjeta Venc'
\gset

-- Una compra del resumen que ya venció + una cuota que cae este mismo mes
insert into public.transactions
  (org_id, description, amount, payment_method_id, kind, status, billing_month, date)
values ((select public.current_org_id()), 'Compra de la Venc', 25000, :'card_id',
        'expense', 'next_month', date_trunc('month', current_date)::date, current_date);

insert into public.installments
  (org_id, description, total_installments, current_installment,
   amount_per_installment, payment_method_id, start_date)
values ((select public.current_org_id()), 'Cuota de la Venc', 3, 1, 10000, :'card_id',
        date_trunc('month', current_date)::date);

-- 4) El total de la vista son las compras MÁS las cuotas del período
select public.t_assert(
  (select compras from public.v_card_statements where payment_method_id = :'card_id') = 25000
  and (select cuotas from public.v_card_statements where payment_method_id = :'card_id') = 10000
  and (select total from public.v_card_statements where payment_method_id = :'card_id') = 35000,
  'la vista suma compras y cuotas del resumen que vence');

-- 5) Y se lleva puesto el día de vencimiento, que es lo que dispara el aviso
select public.t_assert(
  (select due_day from public.v_card_statements where payment_method_id = :'card_id') = 12,
  'la vista trae el día de vencimiento de la tarjeta');

-- 6) Una cuota ya cobrada deja de deberse
insert into public.installment_payments (org_id, installment_id, month_year, amount)
select (select public.current_org_id()), i.id,
       date_trunc('month', current_date)::date, i.amount_per_installment
  from public.installments i where i.description = 'Cuota de la Venc';

select public.t_assert(
  (select total from public.v_card_statements where payment_method_id = :'card_id') = 25000,
  'una cuota ya cobrada sale del total que falta pagar');

-- 7) Una tarjeta sin nada pendiente no figura: no hay nada que avisar
insert into public.payment_methods (org_id, name, kind, due_day)
values ((select public.current_org_id()), 'Tarjeta Limpia', 'credit', 5);

select public.t_assert(
  not exists (select 1 from public.v_card_statements where name = 'Tarjeta Limpia'),
  'una tarjeta sin deuda no aparece en la vista');

-- 8) Cerrar el resumen la saca de la vista
select public.settle_card_month(
  date_trunc('month', current_date)::date, null, :'card_id') as cerrado
\gset

select public.t_assert(
  :'cerrado'::numeric = 25000
  and not exists (select 1 from public.v_card_statements where payment_method_id = :'card_id'),
  'al cerrar el resumen la tarjeta deja de figurar como pendiente');

-- 9) RLS: la vista no es una puerta de atrás a los datos de otra familia
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.t_assert(
  not exists (select 1 from public.v_card_statements
               where name in ('Tarjeta Venc', 'Tarjeta Limpia')),
  'RLS: otra familia no ve los resúmenes de tarjetas ajenas');

rollback;

-- ----------------------------------------- installment_number() (el helper) -
-- La fórmula que comparten la vista, el cierre y el deshacer
select public.t_assert(
  public.installment_number('2026-05-01', '2026-05-01') = 1
  and public.installment_number('2026-05-01', '2026-10-01') = 6
  and public.installment_number('2026-11-01', '2027-01-01') = 3
  and public.installment_number('2026-05-01', '2026-04-01') = 0,
  'installment_number cuenta la cuota que vence en cada mes, y cruza el año');

-- ======= Regresión: un resumen de puras cuotas no se evapora al pagar =======
-- Pasó en la vida real: se pagaron cuatro tarjetas y la quinta, cuyo resumen
-- eran dos cuotas y ninguna compra, desapareció sola de lo que falta pagar.

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

insert into public.payment_methods (org_id, name, kind, due_day)
values ((select public.current_org_id()), 'Tarjeta Solo Cuotas', 'credit', 20);

select id as solo_id from public.payment_methods where name = 'Tarjeta Solo Cuotas'
\gset

insert into public.installments
  (org_id, description, total_installments, current_installment,
   amount_per_installment, payment_method_id, start_date)
values ((select public.current_org_id()), 'Cuota sin compras', 2, 1, 11000, :'solo_id',
        date_trunc('month', current_date)::date);

-- Se pagan TODAS las compras vencidas de la familia: así no queda ningún mes
-- con compras pendientes, que es la situación exacta en la que se perdía.
update public.transactions
   set status = 'settled'
 where org_id = (select public.current_org_id())
   and kind = 'expense'
   and status = 'next_month'
   and billing_month <= date_trunc('month', current_date)::date;

select public.t_assert(
  not exists (select 1 from public.transactions
               where org_id = (select public.current_org_id())
                 and kind = 'expense'
                 and status = 'next_month'
                 and billing_month <= date_trunc('month', current_date)::date),
  'el escenario arranca sin ninguna compra vencida sin pagar');

select public.t_assert(
  (select total from public.v_card_statements where payment_method_id = :'solo_id') = 11000,
  'una tarjeta que debe sólo cuotas sigue figurando aunque no queden compras sin pagar');

-- Y recién cuando se cobra la cuota deja de figurar
select public.settle_card_month(
  date_trunc('month', current_date)::date, null, :'solo_id') as cerrado_solo
\gset

select public.t_assert(
  :'cerrado_solo'::numeric = 11000
  and not exists (select 1 from public.v_card_statements where payment_method_id = :'solo_id'),
  'cobrada la cuota, la tarjeta de puras cuotas deja de figurar');

rollback;
