\set ON_ERROR_STOP on

-- ============ Ingresos que entran a una billetera (income_receipts) ============
-- Reusa la familia 1 (Norma) y la familia 2 (Vecino) de 01_smoke_test.sql.
-- Los tests anteriores dejaron varias billeteras, así que se fija una sola
-- (la primera de tipo bank) y se usa esa en todas las aserciones.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset
select id as u2_id from auth.users where email = 'vecino@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

select id as banco_id, current_balance as banco_antes
from public.wallets
where org_id = (select public.current_org_id()) and type = 'bank'
order by created_at, id
limit 1
\gset

-- 1) Un sueldo que se repite, apuntado a esa billetera
insert into public.income_entries (org_id, description, amount, wallet_id)
values ((select public.current_org_id()), 'Sueldo con destino', 500000, :'banco_id');

select public.t_assert(
  (select wallet_id from public.income_entries where description = 'Sueldo con destino')
    = :'banco_id'::uuid,
  'el ingreso guarda a qué billetera va a entrar');

-- 2) Marcarlo como recibido suma el saldo de verdad
insert into public.income_receipts (org_id, income_entry_id, month_year, amount, wallet_id)
select (select public.current_org_id()), e.id, date_trunc('month', now())::date,
       e.amount, e.wallet_id
from public.income_entries e where e.description = 'Sueldo con destino';

select public.t_assert(
  (select current_balance from public.wallets where id = :'banco_id')
    = :'banco_antes'::numeric + 500000,
  'marcar un ingreso como recibido suma a su billetera');

-- 3) No se puede marcar dos veces el mismo mes (unique)
do $$
begin
  insert into public.income_receipts (org_id, income_entry_id, month_year, amount)
  select (select public.current_org_id()), e.id, date_trunc('month', now())::date, e.amount
  from public.income_entries e where e.description = 'Sueldo con destino';
  raise exception 'no falló el unique de (ingreso, mes)';
exception
  when unique_violation then null;
end $$;

select public.t_assert(true, 'un ingreso no se puede cobrar dos veces en el mismo mes');

-- 4) El mes siguiente sí se marca aparte (sueldo recurrente)
insert into public.income_receipts (org_id, income_entry_id, month_year, amount, wallet_id)
select (select public.current_org_id()), e.id,
       (date_trunc('month', now()) + interval '1 month')::date, e.amount, e.wallet_id
from public.income_entries e where e.description = 'Sueldo con destino';

select public.t_assert(
  (select current_balance from public.wallets where id = :'banco_id')
    = :'banco_antes'::numeric + 1000000,
  'cada mes de un sueldo recurrente se marca y suma por separado');

-- 5) Desmarcar devuelve la plata
delete from public.income_receipts
 where month_year = (date_trunc('month', now()) + interval '1 month')::date;

select public.t_assert(
  (select current_balance from public.wallets where id = :'banco_id')
    = :'banco_antes'::numeric + 500000,
  'desmarcar un ingreso le devuelve la plata a la billetera');

-- 6) Ingreso sin billetera definida: se registra pero no inventa saldo
select current_balance as banco_ahora from public.wallets where id = :'banco_id'
\gset

insert into public.income_entries (org_id, description, amount)
values ((select public.current_org_id()), 'Ingreso sin destino', 7000);

insert into public.income_receipts (org_id, income_entry_id, month_year, amount)
select (select public.current_org_id()), e.id, date_trunc('month', now())::date, e.amount
from public.income_entries e where e.description = 'Ingreso sin destino';

select public.t_assert(
  (select current_balance from public.wallets where id = :'banco_id') = :'banco_ahora'::numeric,
  'un ingreso sin billetera no mueve ningún saldo');

commit;

-- 7) Aislamiento RLS entre familias
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.t_assert(
  (select count(*) from public.income_receipts) = 0,
  'RLS: otra familia no ve los ingresos cobrados ajenos');

commit;
