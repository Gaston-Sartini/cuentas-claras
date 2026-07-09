\set ON_ERROR_STOP on

-- ============ Gastos fijos (recurring_expenses) + categoría en cuotas ============
-- Reusa la familia 1 (Norma) creada por 01_smoke_test.sql.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

-- Línea base de la proyección antes de cargar fijos
select recurring_charges as fijos_antes, total as total_antes
from public.get_next_month_projection()
\gset

-- 1) Fijo vigente: cuenta para el mes que viene
insert into public.recurring_expenses (org_id, description, amount, category_id)
values ((select public.current_org_id()), 'Alquiler', 250000,
        (select id from public.categories where name = 'Hogar' and org_id is null));

-- 2) Fijo que terminó este mes: NO cuenta para el mes que viene
insert into public.recurring_expenses (org_id, description, amount, end_month)
values ((select public.current_org_id()), 'Gimnasio', 10000,
        date_trunc('month', now())::date);

-- 3) Fijo que arranca dentro de 3 meses: todavía NO cuenta
insert into public.recurring_expenses (org_id, description, amount, start_month)
values ((select public.current_org_id()), 'Seguro nuevo', 20000,
        (date_trunc('month', now()) + interval '3 month')::date);

select public.t_assert(
  (select recurring_charges from public.get_next_month_projection())
    = :'fijos_antes'::numeric + 250000,
  'solo los fijos vigentes cuentan para el mes que viene');

select public.t_assert(
  (select total from public.get_next_month_projection())
    = :'total_antes'::numeric + 250000,
  'el total del banner suma tarjetas + cuotas + fijos');

-- 4) Cuotas con categoría: el plan guarda a qué categoría imputa
insert into public.installments
  (org_id, description, total_installments, current_installment,
   amount_per_installment, start_date, category_id,
   payment_method_id)
values (
  (select public.current_org_id()),
  'Notebook en cuotas', 12, 1, 80000,
  (date_trunc('month', now()) + interval '1 month')::date,
  (select id from public.categories where name = 'Educación' and org_id is null),
  (select id from public.payment_methods where name = 'Visa'));

select public.t_assert(
  (select c.name from public.installments i
     join public.categories c on c.id = i.category_id
    where i.description = 'Notebook en cuotas') = 'Educación',
  'las cuotas guardan su categoría');

commit;

-- 5) RLS: el vecino no ve los fijos de la familia 1
select id as u2_id from auth.users where email = 'vecino@test.com' \gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.t_assert(
  (select count(*) from public.recurring_expenses) = 0,
  'RLS: los gastos fijos de otra familia no se ven');

select public.t_assert(
  (select recurring_charges from public.get_next_month_projection()) = 0,
  'RLS: los fijos ajenos no inflan la proyección propia');

commit;

select 'TESTS DE GASTOS FIJOS PASARON' as resultado;
