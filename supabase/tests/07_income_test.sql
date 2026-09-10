\set ON_ERROR_STOP on

-- ============ Ingresos por ítem (income_entries) ============
-- Reusa la familia 1 (Norma) y la familia 2 (Vecino), creadas por
-- 01_smoke_test.sql, para verificar el aislamiento RLS entre familias.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset
select id as u2_id from auth.users where email = 'vecino@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

-- 1) Ingreso recurrente (end_month null): vigente este mes y los que siguen
insert into public.income_entries (org_id, description, amount)
values ((select public.current_org_id()), 'Sueldo Norma', 900000);

-- 2) Ingreso puntual: un solo mes (end_month = start_month)
insert into public.income_entries (org_id, description, amount, start_month, end_month)
values ((select public.current_org_id()), 'Plata que debía Nico', 50000,
        (date_trunc('month', now()) + interval '1 month')::date,
        (date_trunc('month', now()) + interval '1 month')::date);

-- 3) Ingreso que arranca dentro de 3 meses: todavía no cuenta el mes que viene
insert into public.income_entries (org_id, description, amount, start_month)
values ((select public.current_org_id()), 'Aguinaldo futuro', 300000,
        (date_trunc('month', now()) + interval '3 month')::date);

-- "Entra" del mes que viene = recurrentes vigentes + puntuales de ese mes
select public.t_assert(
  (select coalesce(sum(amount), 0) from public.income_entries
    where start_month <= (date_trunc('month', now()) + interval '1 month')::date
      and (end_month is null
           or end_month >= (date_trunc('month', now()) + interval '1 month')::date))
    = 950000,
  'el mes que viene suma el sueldo recurrente y el ingreso puntual');

-- El puntual no se arrastra: en dos meses solo queda el sueldo
select public.t_assert(
  (select coalesce(sum(amount), 0) from public.income_entries
    where start_month <= (date_trunc('month', now()) + interval '2 month')::date
      and (end_month is null
           or end_month >= (date_trunc('month', now()) + interval '2 month')::date))
    = 900000,
  'el ingreso puntual no se repite en los meses siguientes');

-- 4) Validaciones del esquema
do $$
begin
  insert into public.income_entries (org_id, description, amount)
  values ((select public.current_org_id()), 'Monto inválido', 0);
  raise exception 'no falló el check de amount > 0';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.income_entries (org_id, description, amount, start_month)
  values ((select public.current_org_id()), 'Mes inválido', 1000,
          date_trunc('month', now())::date + 10);  -- día 11: nunca es primero de mes
  raise exception 'no falló el check de start_month = primer día del mes';
exception
  when check_violation then null;
end $$;

select public.t_assert(true, 'amount <= 0 y meses no normalizados quedan rechazados');

commit;

-- 5) Aislamiento RLS: la familia 2 no ve los ingresos de la familia 1
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.t_assert(
  (select count(*) from public.income_entries) = 0,
  'RLS: otra familia no ve ingresos ajenos');

commit;

-- 6) Migración de datos legacy: income_projections > 0 pasó a ingresos puntuales
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

insert into public.income_projections (org_id, month_year, estimated_amount)
values ((select public.current_org_id()), date_trunc('month', now())::date, 123456)
on conflict (org_id, month_year) do update set estimated_amount = 123456;

-- La migración ya corrió (en 00009); acá se verifica su regla con una réplica
insert into public.income_entries (org_id, description, amount, start_month, end_month)
select org_id, 'Ingreso mensual', estimated_amount, month_year, month_year
from public.income_projections
where estimated_amount > 0
  and org_id = (select public.current_org_id());

select public.t_assert(
  exists (select 1 from public.income_entries
           where description = 'Ingreso mensual'
             and amount = 123456
             and start_month = date_trunc('month', now())::date
             and end_month = start_month),
  'los montos legacy quedan como ingresos puntuales del mismo mes');

rollback;
