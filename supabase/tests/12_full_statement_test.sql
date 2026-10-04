\set ON_ERROR_STOP on

-- ============ El cierre descuenta el resumen completo (compras + cuotas) ============
-- Reusa la familia 1 (Norma) de 01_smoke_test.sql.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

select id as visa_id from public.payment_methods
 where org_id = (select public.current_org_id()) and name = 'Visa'
\gset
select id as master_id from public.payment_methods
 where org_id = (select public.current_org_id()) and name = 'Mastercard'
\gset
select id as banco_id, current_balance as banco_antes from public.wallets
 where org_id = (select public.current_org_id()) and type = 'bank'
 order by created_at, id limit 1
\gset

-- Mes de prueba lejano (+22): ahi no vence ninguna cuota de los otros tests
-- Compra de 40.000 con Visa + una cuota de 15.000 de Visa que vence ese mes
insert into public.transactions
  (org_id, description, amount, payment_method_id, kind, status, billing_month, date)
values ((select public.current_org_id()), 'Compra del resumen', 40000, :'visa_id',
        'expense', 'next_month',
        (date_trunc('month', now()) + interval '22 month')::date, current_date);

insert into public.installments
  (org_id, description, total_installments, current_installment,
   amount_per_installment, payment_method_id, start_date)
values ((select public.current_org_id()), 'Cuota del resumen', 6, 1, 15000, :'visa_id',
        (date_trunc('month', now()) + interval '22 month')::date);

-- Y una cuota de OTRA tarjeta el mismo mes: no se tiene que tocar
insert into public.installments
  (org_id, description, total_installments, current_installment,
   amount_per_installment, payment_method_id, start_date)
values ((select public.current_org_id()), 'Cuota de la otra', 6, 1, 7000, :'master_id',
        (date_trunc('month', now()) + interval '22 month')::date);

-- 1) Cerrar la Visa descuenta compra + cuota
select public.settle_card_month(
  (date_trunc('month', now()) + interval '22 month')::date, :'banco_id', :'visa_id') as cerrado
\gset

select public.t_assert(
  :'cerrado'::numeric = 55000,
  'el cierre devuelve el resumen completo: compras mas cuotas');

select public.t_assert(
  (select current_balance from public.wallets where id = :'banco_id')
    = :'banco_antes'::numeric - 55000,
  'del banco sale el resumen completo, no solo las compras');

select public.t_assert(
  (select count(*) from public.installment_payments
    where month_year = (date_trunc('month', now()) + interval '22 month')::date) = 1,
  'queda registrada la cuota cobrada de esa tarjeta');

-- 2) Tocar el boton dos veces no descuenta de nuevo
select public.settle_card_month(
  (date_trunc('month', now()) + interval '22 month')::date, :'banco_id', :'visa_id') as repetido
\gset

select public.t_assert(
  :'repetido'::numeric = 0
  and (select current_balance from public.wallets where id = :'banco_id')
      = :'banco_antes'::numeric - 55000,
  'cerrar dos veces la misma tarjeta no vuelve a descontar');

-- 3) La cuota de la otra tarjeta sigue sin cobrar
select public.t_assert(
  not exists (
    select 1 from public.installment_payments p
      join public.installments i on i.id = p.installment_id
     where i.description = 'Cuota de la otra'),
  'la cuota de la tarjeta que no se cerro queda pendiente');

-- 4) Cerrar el resto (sin medio) agarra esa cuota
select public.settle_card_month(
  (date_trunc('month', now()) + interval '22 month')::date, :'banco_id') as resto
\gset

select public.t_assert(
  :'resto'::numeric = 7000
  and (select current_balance from public.wallets where id = :'banco_id')
      = :'banco_antes'::numeric - 62000,
  'sin medio cierra lo que faltaba, cuotas incluidas');

rollback;
