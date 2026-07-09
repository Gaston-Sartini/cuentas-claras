\set ON_ERROR_STOP on

-- ============ Presupuestos por categoría (category_budgets) ============
-- Reusa la familia 1 (Norma) y la 2 (vecino) de 01_smoke_test.sql.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset
select id as u2_id from auth.users where email = 'vecino@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

-- 1) Tope para una categoría global
insert into public.category_budgets (org_id, category_id, monthly_amount)
values ((select public.current_org_id()),
        (select id from public.categories where name = 'Supermercado' and org_id is null),
        300000);

select public.t_assert(
  (select monthly_amount from public.category_budgets
     join public.categories on categories.id = category_budgets.category_id
    where categories.name = 'Supermercado') = 300000,
  'se guarda el tope de una categoría');

-- 2) Un solo tope por categoría: el segundo intento choca contra el unique
do $$
begin
  insert into public.category_budgets (org_id, category_id, monthly_amount)
  values ((select public.current_org_id()),
          (select id from public.categories where name = 'Supermercado' and org_id is null),
          400000);
  raise exception 'ASSERT FAIL: se permitió un segundo tope para la misma categoría';
exception
  when unique_violation then
    raise notice 'OK: no se puede duplicar el tope de una categoría';
  when raise_exception then
    if sqlerrm like '%ASSERT FAIL%' then raise; end if;
end $$;

-- 3) Editar el tope (upsert desde el cliente)
update public.category_budgets
   set monthly_amount = 350000
 where category_id = (select id from public.categories where name = 'Supermercado' and org_id is null);

select public.t_assert(
  (select monthly_amount from public.category_budgets
     join public.categories on categories.id = category_budgets.category_id
    where categories.name = 'Supermercado') = 350000,
  'se puede editar el tope');

commit;

-- 4) RLS: el vecino no ve ni puede tocar los topes de la familia 1
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.t_assert(
  (select count(*) from public.category_budgets) = 0,
  'RLS: los topes de otra familia no se ven');

commit;

select 'TESTS DE PRESUPUESTOS PASARON' as resultado;
