\set ON_ERROR_STOP on

-- Helper de aserciones
create or replace function public.t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ASSERT FAIL: %', msg;
  end if;
  raise notice 'OK: %', msg;
end $$;
grant execute on function public.t_assert(boolean, text) to public;

-- ============ Usuario 1: signup crea familia nueva ============
insert into auth.users (email, raw_user_meta_data)
values ('norma@test.com', '{"full_name":"Norma","org_name":"Familia Sartini"}'::jsonb)
returning id
\gset u1_

select org_id as org1 from public.profiles where id = :'u1_id'
\gset

select public.t_assert(
  (select count(*) from public.wallets where org_id = :'org1') = 3,
  'signup crea 3 billeteras por defecto');

select public.t_assert(
  (select role from public.profiles where id = :'u1_id') = 'owner',
  'primer usuario es owner');

select invite_code as invite1 from public.organizations where id = :'org1'
\gset

-- ============ Sesión como usuario 1 (RLS activa) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

select id as w_bank from public.wallets where type = 'bank' \gset
select id as w_cash from public.wallets where type = 'cash' \gset
select id as w_mp   from public.wallets where type = 'mercadopago' \gset

-- Ajuste manual de saldos (permitido por spec)
update public.wallets set current_balance = 500000 where id = :'w_bank';
update public.wallets set current_balance = 100000 where id = :'w_cash';
update public.wallets set current_balance =  50000 where id = :'w_mp';

-- Gasto en efectivo: descuenta billetera y se imputa a este mes
insert into public.transactions (org_id, description, amount, category_id, payment_method)
values (
  (select public.current_org_id()),
  'Verdulería', 12000,
  (select id from public.categories where name = 'Supermercado' and org_id is null),
  'cash');

select public.t_assert(
  (select current_balance from public.wallets where id = :'w_cash') = 88000,
  'gasto en efectivo descuenta la billetera Efectivo');

select public.t_assert(
  (select billing_month from public.transactions where description = 'Verdulería')
    = date_trunc('month', now())::date,
  'gasto contado se imputa al mes actual');

-- Gasto con Visa: pasa solo a next_month, no toca saldos
insert into public.transactions (org_id, description, amount, payment_method)
values ((select public.current_org_id()), 'Zapatillas', 30000, 'visa');

select public.t_assert(
  (select status from public.transactions where description = 'Zapatillas') = 'next_month',
  'tarjeta se enruta automáticamente a next_month');

select public.t_assert(
  (select billing_month from public.transactions where description = 'Zapatillas')
    = (date_trunc('month', now()) + interval '1 month')::date,
  'tarjeta se imputa al mes que viene');

select public.t_assert(
  (select current_balance from public.wallets where id = :'w_cash') = 88000
  and (select current_balance from public.wallets where id = :'w_bank') = 500000,
  'tarjeta no toca ninguna billetera');

-- Cuota "2 de 6" cargada hoy => cuota 1 fue el mes pasado
insert into public.installments
  (org_id, description, total_installments, current_installment,
   amount_per_installment, payment_method, start_date)
values (
  (select public.current_org_id()),
  'Librería', 6, 2, 65000, 'visa',
  (date_trunc('month', now()) - interval '1 month')::date);

-- Banner rojo: 30000 (visa) + 65000 (cuota 3 de 6 del mes que viene)
select public.t_assert(
  card_charges = 30000 and installment_charges = 65000 and total = 95000,
  'proyección del mes que viene = tarjetas + cuotas')
from public.get_next_month_projection();

-- Retiro de cajero: Banco -> Efectivo, movimiento neutro
select public.transfer_between_wallets(:'w_bank', :'w_cash', 20000, 'Retiro cajero') as tx1
\gset

select public.t_assert(
  (select current_balance from public.wallets where id = :'w_bank') = 480000
  and (select current_balance from public.wallets where id = :'w_cash') = 108000,
  'retiro de cajero mueve Banco -> Efectivo');

select public.t_assert(
  (select kind from public.transactions where id = :'tx1') = 'transfer',
  'el retiro queda logueado como transferencia neutra');

select public.t_assert(
  (select total from public.get_next_month_projection()) = 95000,
  'la transferencia no infla la proyección ni cuenta como gasto');

-- Borrar un gasto en efectivo devuelve la plata
delete from public.transactions where description = 'Verdulería';
select public.t_assert(
  (select current_balance from public.wallets where id = :'w_cash') = 120000,
  'borrar un gasto en efectivo devuelve el saldo');

-- Categoría custom inline
insert into public.categories (org_id, name, icon)
values ((select public.current_org_id()), 'Kiosco', 'candy');

select public.t_assert(
  (select count(*) from public.categories) = 13,
  'usuario ve 12 globales + 1 propia');

-- Ingresos futuros: upsert (repetir y luego sobrescribir un mes puntual)
insert into public.income_projections (org_id, month_year, estimated_amount)
values ((select public.current_org_id()),
        (date_trunc('month', now()) + interval '1 month')::date, 900000)
on conflict (org_id, month_year) do update set estimated_amount = excluded.estimated_amount;

insert into public.income_projections (org_id, month_year, estimated_amount)
values ((select public.current_org_id()),
        (date_trunc('month', now()) + interval '1 month')::date, 950000)
on conflict (org_id, month_year) do update set estimated_amount = excluded.estimated_amount;

select public.t_assert(
  (select estimated_amount from public.income_projections
    where month_year = (date_trunc('month', now()) + interval '1 month')::date) = 950000,
  'ingreso proyectado se sobrescribe por upsert');

commit;

-- ============ Usuario 2: familia distinta, no ve nada de la 1 ============
insert into auth.users (email, raw_user_meta_data)
values ('vecino@test.com', '{}'::jsonb)
returning id
\gset u2_

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);
select set_config('test.org1', :'org1', true);

select public.t_assert((select count(*) from public.transactions) = 0,
  'RLS: usuario 2 no ve transacciones ajenas');
select public.t_assert((select count(*) from public.wallets) = 3,
  'RLS: usuario 2 ve solo sus 3 billeteras');
select public.t_assert((select count(*) from public.categories) = 12,
  'RLS: usuario 2 no ve la categoría custom ajena');

do $$
begin
  insert into public.transactions (org_id, description, amount, payment_method)
  values (current_setting('test.org1')::uuid, 'Hackeo', 1, 'cash');
  raise exception 'ASSERT FAIL: RLS permitió insertar en otra familia';
exception
  when insufficient_privilege then
    raise notice 'OK: RLS bloquea escrituras cross-familia';
end $$;

commit;

-- ============ Usuario 3: se suma a la familia 1 con invite_code ============
insert into auth.users (email, raw_user_meta_data)
values ('primo@test.com',
        jsonb_build_object('invite_code', :'invite1', 'full_name', 'Primo'))
returning id
\gset u3_

select public.t_assert(
  (select org_id from public.profiles where id = :'u3_id') = :'org1'::uuid,
  'invite_code suma al usuario a la familia existente');

select public.t_assert(
  (select role from public.profiles where id = :'u3_id') = 'member',
  'invitado entra como member');

select public.t_assert(
  (select count(*) from public.wallets where org_id = :'org1') = 3,
  'sumarse con invite no duplica billeteras');

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u3_id')::text, true);

select public.t_assert(
  (select count(*) from public.transactions where kind = 'transfer') = 1,
  'realtime compartido: el primo ve el retiro de cajero de Norma');

commit;

select 'TODOS LOS TESTS PASARON' as resultado;
