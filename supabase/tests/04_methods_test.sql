\set ON_ERROR_STOP on

-- ============ Medios de pago propios (payment_methods) ============
-- Reusa la familia 1 (Norma) creada por 01_smoke_test.sql.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset

-- 1) El backfill dejó 4 métodos por defecto en la familia existente
select public.t_assert(
  (select count(*) from public.payment_methods pm
    join public.profiles p on p.org_id = pm.org_id
   where p.id = :'u1_id' and pm.is_default) = 4,
  'familia existente arranca con los 4 métodos clásicos');

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

-- 2) Efectivo quedó linkeado a la billetera de efectivo
select public.t_assert(
  (select w.type from public.payment_methods m
     join public.wallets w on w.id = m.wallet_id
    where m.name = 'Efectivo') = 'cash',
  'método Efectivo linkeado a la billetera de efectivo');

-- 3) Billetera nueva + débito linkeado: "Visa débito Gasti" -> "BBVA Gasti"
insert into public.wallets (org_id, name, type, current_balance)
values ((select public.current_org_id()), 'BBVA Gasti', 'bank', 200000)
returning id as w_bbva
\gset

insert into public.payment_methods (org_id, name, kind, wallet_id)
values ((select public.current_org_id()), 'Visa débito Gasti', 'debit', :'w_bbva')
returning id as m_debito
\gset

insert into public.transactions (org_id, description, amount, payment_method_id)
values ((select public.current_org_id()), 'Super con débito', 45000, :'m_debito');

select public.t_assert(
  (select current_balance from public.wallets where id = :'w_bbva') = 155000,
  'débito linkeado descuenta la billetera del banco elegido');

select public.t_assert(
  (select status from public.transactions where description = 'Super con débito') = 'settled',
  'débito se imputa al mes actual, no al que viene');

-- 4) Borrar el gasto con débito devuelve la plata al banco
delete from public.transactions where description = 'Super con débito';
select public.t_assert(
  (select current_balance from public.wallets where id = :'w_bbva') = 200000,
  'borrar un gasto con débito devuelve el saldo');

-- 5) Tarjeta de crédito nueva: "Amex Gasti" va al mes que viene sin tocar saldos
insert into public.payment_methods (org_id, name, kind)
values ((select public.current_org_id()), 'Amex Gasti', 'credit')
returning id as m_amex
\gset

insert into public.transactions (org_id, description, amount, payment_method_id)
values ((select public.current_org_id()), 'Compra con Amex', 70000, :'m_amex');

select public.t_assert(
  (select status from public.transactions where description = 'Compra con Amex') = 'next_month'
  and (select billing_month from public.transactions where description = 'Compra con Amex')
      = (date_trunc('month', now()) + interval '1 month')::date,
  'crédito custom va a la cuenta del mes que viene');

select public.t_assert(
  (select current_balance from public.wallets where id = :'w_bbva') = 200000,
  'crédito custom no toca ninguna billetera');

-- 6) El cierre mensual también paga las tarjetas custom
select public.settle_card_month(
  (date_trunc('month', now()) + interval '1 month')::date, null) as settled
\gset

select public.t_assert(
  (select status from public.transactions where description = 'Compra con Amex') = 'settled',
  'settle_card_month paga también las tarjetas custom');

commit;

-- 7) Un método de otra familia se rechaza
select id as u2_id from auth.users where email = 'vecino@test.com' \gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);
select set_config('test.m_amex_ajeno', :'m_amex', true);

select public.t_assert(
  (select count(*) from public.payment_methods where name = 'Amex Gasti') = 0,
  'RLS: los métodos de otra familia no se ven');

do $$
begin
  insert into public.transactions (org_id, description, amount, payment_method_id)
  values ((select public.current_org_id()), 'Hackeo método', 1,
          current_setting('test.m_amex_ajeno')::uuid);
  raise exception 'ASSERT FAIL: se aceptó un método de otra familia';
exception
  when raise_exception then
    if sqlerrm like '%ASSERT FAIL%' then raise; end if;
    raise notice 'OK: un gasto no puede usar métodos de otra familia';
end $$;

commit;

-- 8) Familia nueva: el signup crea los 4 métodos por defecto
insert into auth.users (email, raw_user_meta_data)
values ('nuevo@test.com', '{"org_name":"Familia Métodos"}'::jsonb)
returning id
\gset u4_

select public.t_assert(
  (select count(*) from public.payment_methods pm
    join public.profiles p on p.org_id = pm.org_id
   where p.id = :'u4_id') = 4,
  'familia nueva arranca con 4 métodos por defecto');

select 'TESTS DE MEDIOS DE PAGO PASARON' as resultado;
