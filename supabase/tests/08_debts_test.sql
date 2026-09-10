\set ON_ERROR_STOP on

-- ============ Deudas (debts) + día de vencimiento de fijos ============
-- Reusa la familia 1 (Norma) y la familia 2 (Vecino) de 01_smoke_test.sql.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset
select id as u2_id from auth.users where email = 'vecino@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

-- 1) Alta en ambas direcciones, con y sin vencimiento
insert into public.debts (org_id, description, amount, direction, due_date) values
  ((select public.current_org_id()), 'Nico – asado', 50000, 'owed_to_us', current_date + 3),
  ((select public.current_org_id()), 'Cuota del club', 30000, 'we_owe', current_date - 2),
  ((select public.current_org_id()), 'Sin fecha', 10000, 'we_owe', null);

select public.t_assert(
  (select count(*) from public.debts where settled_at is null) = 3
  and (select sum(amount) from public.debts where direction = 'owed_to_us') = 50000,
  'las deudas se cargan en ambas direcciones, con o sin vencimiento');

-- 2) Saldar no borra: sale de las activas pero queda en la tabla
update public.debts set settled_at = now() where description = 'Nico – asado';

select public.t_assert(
  (select count(*) from public.debts where settled_at is null) = 2
  and (select count(*) from public.debts) = 3,
  'saldar marca settled_at sin borrar la fila');

-- 3) Validaciones del esquema: dirección inventada y monto en cero
do $$
begin
  insert into public.debts (org_id, description, amount, direction)
  values ((select public.current_org_id()), 'Inválida', 1000, 'me_fio');
  raise exception 'no falló el check de direction';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.debts (org_id, description, amount, direction)
  values ((select public.current_org_id()), 'Inválida', 0, 'we_owe');
  raise exception 'no falló el check de amount > 0';
exception
  when check_violation then null;
end $$;

select public.t_assert(true, 'direction inválida y amount <= 0 quedan rechazados');

-- 4) Día de vencimiento en fijos: 1-31 vale, fuera de rango no
insert into public.recurring_expenses (org_id, description, amount, due_day)
values ((select public.current_org_id()), 'Internet con vencimiento', 25000, 10);

do $$
begin
  insert into public.recurring_expenses (org_id, description, amount, due_day)
  values ((select public.current_org_id()), 'Día imposible', 1000, 45);
  raise exception 'no falló el check de due_day';
exception
  when check_violation then null;
end $$;

select public.t_assert(
  (select due_day from public.recurring_expenses
    where description = 'Internet con vencimiento') = 10,
  'due_day guarda 1-31 y rechaza el resto');

commit;

-- 5) Aislamiento RLS: la familia 2 no ve deudas ajenas
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.t_assert(
  (select count(*) from public.debts) = 0,
  'RLS: otra familia no ve deudas ajenas');

commit;
