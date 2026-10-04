\set ON_ERROR_STOP on

-- ============ Deshacer el cierre de una tarjeta ============
-- Reusa la familia 1 (Norma). Mes lejano (+30) para no depender de las
-- cuotas que cargan los otros archivos del suite.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

select id as visa_id from public.payment_methods
 where org_id = (select public.current_org_id()) and name = 'Visa'
\gset
select id as banco_id, current_balance as banco_antes from public.wallets
 where org_id = (select public.current_org_id()) and type = 'bank'
 order by created_at, id limit 1
\gset

insert into public.transactions
  (org_id, description, amount, payment_method_id, kind, status, billing_month, date)
values ((select public.current_org_id()), 'Compra a deshacer', 25000, :'visa_id',
        'expense', 'next_month',
        (date_trunc('month', now()) + interval '30 month')::date, current_date);

insert into public.installments
  (org_id, description, total_installments, current_installment,
   amount_per_installment, payment_method_id, start_date)
values ((select public.current_org_id()), 'Cuota a deshacer', 4, 1, 5000, :'visa_id',
        (date_trunc('month', now()) + interval '30 month')::date);

-- Cerrar: sale 30000 (25000 compra + 5000 cuota)
select public.settle_card_month(
  (date_trunc('month', now()) + interval '30 month')::date, :'banco_id', :'visa_id') as cerrado
\gset

select public.t_assert(
  :'cerrado'::numeric = 30000
  and (select current_balance from public.wallets where id = :'banco_id')
      = :'banco_antes'::numeric - 30000,
  'el cierre descuenta compras mas cuotas');

-- Deshacer: vuelve todo
select public.unsettle_card_month(
  (date_trunc('month', now()) + interval '30 month')::date, :'banco_id', :'visa_id') as devuelto
\gset

select public.t_assert(
  :'devuelto'::numeric = 30000,
  'deshacer devuelve el mismo total que se habia cobrado');

select public.t_assert(
  (select current_balance from public.wallets where id = :'banco_id')
    = :'banco_antes'::numeric,
  'la billetera queda igual que antes de cerrar');

select public.t_assert(
  (select status from public.transactions where description = 'Compra a deshacer') = 'next_month',
  'la compra vuelve a estar pendiente');

select public.t_assert(
  not exists (select 1 from public.installment_payments p
               join public.installments i on i.id = p.installment_id
              where i.description = 'Cuota a deshacer'),
  'la cuota deja de estar cobrada');

-- Deshacer dos veces no inventa plata
select public.t_assert(
  public.unsettle_card_month(
    (date_trunc('month', now()) + interval '30 month')::date, :'banco_id', :'visa_id') = 0
  and (select current_balance from public.wallets where id = :'banco_id')
      = :'banco_antes'::numeric,
  'deshacer dos veces no devuelve plata de mas');

-- Y se puede volver a cerrar despues de deshacer
select public.t_assert(
  public.settle_card_month(
    (date_trunc('month', now()) + interval '30 month')::date, :'banco_id', :'visa_id') = 30000,
  'despues de deshacer se puede cerrar de nuevo');

rollback;
