\set ON_ERROR_STOP on

-- ============ Gastos en dólares y tipo de cambio de la familia ============
-- Reusa la familia 1 (Norma) y la familia 2 (Vecino) de 01_smoke_test.sql.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset
select id as u2_id from auth.users where email = 'vecino@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

-- 1) Toda familia arranca con un dólar cargado (no hay nulls que romper)
select public.t_assert(
  (select usd_rate from public.organizations where id = (select public.current_org_id())) > 0,
  'la familia arranca con un tipo de cambio cargado');

-- 2) El dólar no puede ser cero ni negativo
do $$
begin
  perform public.set_usd_rate(0);
  raise exception 'aceptó un dólar en cero';
exception
  when others then
    if sqlerrm like '%dólar%' then null; else raise; end if;
end $$;

select public.t_assert(true, 'el dólar tiene que ser mayor a cero');

-- ------------------------------------------------------ consumos en dólares -
insert into public.payment_methods (org_id, name, kind, due_day)
values ((select public.current_org_id()), 'Tarjeta Dolar', 'credit', 15);

select id as card_id from public.payment_methods where name = 'Tarjeta Dolar'
\gset

select public.set_usd_rate(1000) as r0
\gset

-- Un consumo en dólares (20 USD a 1000 = 20.000) y uno en pesos
insert into public.transactions
  (org_id, description, amount, amount_usd, payment_method_id, kind, status, billing_month, date)
values ((select public.current_org_id()), 'Suscripción en dólares', 20000, 20, :'card_id',
        'expense', 'next_month', date_trunc('month', current_date)::date, current_date);

insert into public.transactions
  (org_id, description, amount, payment_method_id, kind, status, billing_month, date)
values ((select public.current_org_id()), 'Compra en pesos', 35000, :'card_id',
        'expense', 'next_month', date_trunc('month', current_date)::date, current_date);

-- 3) La vista no mezcla: pesos por un lado, dólares por el otro
select public.t_assert(
  (select compras from public.v_card_statements where payment_method_id = :'card_id') = 35000
  and (select usd from public.v_card_statements where payment_method_id = :'card_id') = 20
  and (select total from public.v_card_statements where payment_method_id = :'card_id') = 35000,
  'la vista separa los pesos del resumen de los dólares del resumen');

-- 4) Y recién al final los junta, al cambio de la familia
select public.t_assert(
  (select total_ars from public.v_card_statements where payment_method_id = :'card_id')
    = 35000 + 20 * 1000,
  'total_ars suma los pesos más los dólares pasados al cambio');

-- 5) Cambiar el dólar recotiza lo que falta pagar
select public.set_usd_rate(1550) as r1
\gset

select public.t_assert(
  :'r1'::numeric = 1550
  and (select usd_rate from public.organizations where id = (select public.current_org_id())) = 1550,
  'el dólar de la familia se puede cambiar');

select public.t_assert(
  (select amount from public.transactions where description = 'Suscripción en dólares') = 31000
  and (select total_ars from public.v_card_statements where payment_method_id = :'card_id')
      = 35000 + 20 * 1550,
  'al cambiar el dólar se recotiza lo que todavía no se pagó');

select public.t_assert(
  (select amount from public.transactions where description = 'Compra en pesos') = 35000,
  'lo que vino en pesos no se toca cuando cambia el dólar');

-- 6) Lo ya pagado queda como quedó: es lo que de verdad salió
update public.transactions set status = 'settled'
 where description = 'Suscripción en dólares';

select public.set_usd_rate(2000);

select public.t_assert(
  (select amount from public.transactions where description = 'Suscripción en dólares') = 31000,
  'un gasto en dólares ya pagado no se recotiza');

-- 7) Una tarjeta que sólo tiene consumos en dólares igual figura
insert into public.payment_methods (org_id, name, kind, due_day)
values ((select public.current_org_id()), 'Tarjeta Solo Dolar', 'credit', 20);

select id as solo_usd from public.payment_methods where name = 'Tarjeta Solo Dolar'
\gset

insert into public.transactions
  (org_id, description, amount, amount_usd, payment_method_id, kind, status, billing_month, date)
values ((select public.current_org_id()), 'Netflix', 19640, 9.82, :'solo_usd',
        'expense', 'next_month', date_trunc('month', current_date)::date, current_date);

select public.t_assert(
  (select total from public.v_card_statements where payment_method_id = :'solo_usd') = 0
  and (select usd from public.v_card_statements where payment_method_id = :'solo_usd') = 9.82
  and (select total_ars from public.v_card_statements where payment_method_id = :'solo_usd')
      = round(9.82 * 2000, 2),
  'una tarjeta con sólo consumos en dólares no desaparece del resumen');

-- 8) Los fijos en dólares también siguen al cambio
insert into public.recurring_expenses
  (org_id, description, amount, amount_usd, start_month)
values ((select public.current_org_id()), 'Claude', 40000, 20,
        date_trunc('month', current_date)::date);

select public.set_usd_rate(1500);

select public.t_assert(
  (select amount from public.recurring_expenses where description = 'Claude') = 30000,
  'un gasto fijo en dólares se recotiza al cambiar el dólar');

-- 9) Un monto en dólares tiene que ser positivo
do $$
begin
  insert into public.transactions
    (org_id, description, amount, amount_usd, payment_method_id, kind, status, billing_month, date)
  values ((select public.current_org_id()), 'Dolares negativos', 100, -5,
          (select id from public.payment_methods where name = 'Tarjeta Dolar'),
          'expense', 'next_month', date_trunc('month', current_date)::date, current_date);
  raise exception 'entró un consumo en dólares negativo';
exception
  when check_violation then null;
end $$;

select public.t_assert(true, 'un consumo en dólares no puede ser negativo');

rollback;

-- 10) Aislamiento: el dólar es de cada familia
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.set_usd_rate(1234);

select public.t_assert(
  (select usd_rate from public.organizations where id = (select public.current_org_id())) = 1234,
  'cada familia tiene su propio dólar');

select public.t_assert(
  (select count(*) from public.organizations) = 1,
  'RLS: una familia no ve ni toca el dólar de la otra');

rollback;
