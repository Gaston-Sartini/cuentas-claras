\set ON_ERROR_STOP on

-- ============ Paso 5: cierre mensual de tarjetas (settle_card_month) ============
-- Reusa la familia 1 (Norma) creada por 01_smoke_test.sql.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

select id as w_bank from public.wallets where type = 'bank' \gset
select current_balance as bank_before from public.wallets where id = :'w_bank' \gset

-- Una compra extra con Mastercard, también para el mes que viene
insert into public.transactions (org_id, description, amount, payment_method)
values ((select public.current_org_id()), 'Farmacia', 20000, 'mastercard');

-- Y una compra con tarjeta de OTRO mes (dentro de dos meses) que no debe tocarse
insert into public.transactions
  (org_id, description, amount, payment_method, status, billing_month)
values ((select public.current_org_id()), 'Compra lejana', 99000, 'visa', 'next_month',
        (date_trunc('month', now()) + interval '2 month')::date);

-- 1) El total del cierre = todas las tarjetas de ese mes (30000 Zapatillas + 20000 Farmacia)
select public.settle_card_month(
  (date_trunc('month', now()) + interval '1 month')::date, :'w_bank') as settled_total
\gset

select public.t_assert(:'settled_total'::numeric = 50000,
  'settle devuelve el total de tarjetas del mes');

-- 2) Las compras del mes quedan pagadas
select public.t_assert(
  (select count(*) from public.transactions
    where payment_method in ('mastercard','visa')
      and billing_month = (date_trunc('month', now()) + interval '1 month')::date
      and status = 'next_month') = 0,
  'las compras del mes cerrado pasan a settled');

-- 3) El mes contable no cambia: el gasto sigue en el ledger del mes pagado
select public.t_assert(
  (select billing_month from public.transactions where description = 'Zapatillas')
    = (date_trunc('month', now()) + interval '1 month')::date,
  'el cierre no cambia billing_month (el ledger mensual queda intacto)');

-- 4) La billetera elegida se descuenta por el total
select public.t_assert(
  (select current_balance from public.wallets where id = :'w_bank')
    = :'bank_before'::numeric - 50000,
  'settle descuenta el total de la billetera elegida');

-- 5) Otros meses no se tocan
select public.t_assert(
  (select status from public.transactions where description = 'Compra lejana') = 'next_month',
  'las tarjetas de otros meses no se tocan');

-- 6) Doble toque: la segunda llamada devuelve 0 y no vuelve a descontar
select public.t_assert(
  public.settle_card_month(
    (date_trunc('month', now()) + interval '1 month')::date, :'w_bank') = 0,
  'segunda llamada devuelve 0 (a prueba de doble toque)');

select public.t_assert(
  (select current_balance from public.wallets where id = :'w_bank')
    = :'bank_before'::numeric - 50000,
  'el doble toque no descuenta dos veces');

-- 7) p_wallet null: marca pagado sin tocar billeteras
insert into public.transactions (org_id, description, amount, payment_method)
values ((select public.current_org_id()), 'Nafta', 15000, 'visa');

select public.t_assert(
  public.settle_card_month(
    (date_trunc('month', now()) + interval '1 month')::date, null) = 15000,
  'settle con wallet null marca pagado igual');

select public.t_assert(
  (select current_balance from public.wallets where id = :'w_bank')
    = :'bank_before'::numeric - 50000,
  'settle con wallet null no toca billeteras');

commit;

-- 8) Billetera ajena => aborta todo (las compras siguen pendientes)
select id as u2_id from auth.users where email = 'vecino@test.com' \gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);
select set_config('test.w_bank_ajena', :'w_bank', true);

insert into public.transactions (org_id, description, amount, payment_method)
values ((select public.current_org_id()), 'Compra vecino', 40000, 'visa');

do $$
begin
  perform public.settle_card_month(
    (date_trunc('month', now()) + interval '1 month')::date,
    current_setting('test.w_bank_ajena')::uuid);
  raise exception 'ASSERT FAIL: settle aceptó una billetera de otra familia';
exception
  when raise_exception then
    if sqlerrm like '%ASSERT FAIL%' then raise; end if;
    raise notice 'OK: settle rechaza billeteras de otra familia';
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.t_assert(
  (select status from public.transactions where description = 'Compra vecino') is null,
  'el settle fallido no dejó nada a medias (rollback total)');

commit;

select 'TESTS DE CIERRE MENSUAL PASARON' as resultado;
