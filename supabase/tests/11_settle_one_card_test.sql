\set ON_ERROR_STOP on

-- ============ Cerrar el resumen de una sola tarjeta ============
-- Reusa la familia 1 (Norma) de 01_smoke_test.sql.
-- Usa meses lejanos (+20/+21) a proposito: ahi no vence ninguna cuota de los
-- otros tests, asi las cuentas dependen solo de lo que carga este archivo.

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

-- Dos compras del mismo mes, cada una con su tarjeta
insert into public.transactions
  (org_id, description, amount, payment_method_id, kind, status, billing_month, date)
values
  ((select public.current_org_id()), 'Compra Visa', 30000, :'visa_id', 'expense',
   'next_month', (date_trunc('month', now()) + interval '20 month')::date, current_date),
  ((select public.current_org_id()), 'Compra Master', 20000, :'master_id', 'expense',
   'next_month', (date_trunc('month', now()) + interval '20 month')::date, current_date);

-- 1) Cerrar sólo la Visa deja la Mastercard pendiente
select public.settle_card_month(
  (date_trunc('month', now()) + interval '20 month')::date, null, :'visa_id') as cerrado_visa
\gset

select public.t_assert(
  :'cerrado_visa'::numeric = 30000,
  'cerrar una tarjeta devuelve sólo el total de esa tarjeta');

select public.t_assert(
  (select status from public.transactions where description = 'Compra Visa') = 'settled'
  and (select status from public.transactions where description = 'Compra Master') = 'next_month',
  'la otra tarjeta queda sin pagar');

-- 2) Cerrar el resto (sin medio) agarra lo que quedaba
select public.settle_card_month(
  (date_trunc('month', now()) + interval '20 month')::date) as cerrado_resto
\gset

select public.t_assert(
  :'cerrado_resto'::numeric = 20000
  and (select status from public.transactions where description = 'Compra Master') = 'settled',
  'sin medio cierra todas las tarjetas que quedaban');

-- 3) Descontar de una billetera sigue andando, y sólo por lo de esa tarjeta
select id as banco_id, current_balance as banco_antes from public.wallets
 where org_id = (select public.current_org_id()) and type = 'bank'
 order by created_at, id limit 1
\gset

insert into public.transactions
  (org_id, description, amount, payment_method_id, kind, status, billing_month, date)
values
  ((select public.current_org_id()), 'Visa a descontar', 11000, :'visa_id', 'expense',
   'next_month', (date_trunc('month', now()) + interval '21 month')::date, current_date),
  ((select public.current_org_id()), 'Master que queda', 5000, :'master_id', 'expense',
   'next_month', (date_trunc('month', now()) + interval '21 month')::date, current_date);

select public.settle_card_month(
  (date_trunc('month', now()) + interval '21 month')::date, :'banco_id', :'visa_id') as cerrado_con_banco
\gset

select public.t_assert(
  (select current_balance from public.wallets where id = :'banco_id')
    = :'banco_antes'::numeric - 11000,
  'el descuento de la billetera es sólo por la tarjeta que se cerró');

select public.t_assert(
  (select status from public.transactions where description = 'Master que queda') = 'next_month',
  'la tarjeta que no se cerró no toca el saldo');

-- 4) Un medio de pago que no es de la familia no cierra nada.
--    Se usa un uuid inventado: la RLS ya esconde los de otras familias, así
--    que desde acá "ajeno" e "inexistente" son el mismo caso.
do $$
begin
  perform public.settle_card_month(date_trunc('month', now())::date, null, gen_random_uuid());
  raise exception 'aceptó un medio de pago que no es de la familia';
exception
  when others then
    if sqlerrm <> 'Medio de pago inexistente o de otra cuenta' then raise; end if;
end $$;

select public.t_assert(true, 'un medio de pago que no es de la familia queda rechazado');

rollback;
