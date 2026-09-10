\set ON_ERROR_STOP on

-- ============ Web Push (push_subscriptions + app_secrets) ============
-- Reusa la familia 1 (Norma) y la familia 2 (Vecino) de 01_smoke_test.sql.

select id as u1_id from auth.users where email = 'norma@test.com'
\gset
select id as u2_id from auth.users where email = 'vecino@test.com'
\gset

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u1_id')::text, true);

-- 1) Alta de una suscripción del navegador de Norma
insert into public.push_subscriptions (org_id, profile_id, endpoint, p256dh, auth)
values ((select public.current_org_id()), :'u1_id'::uuid,
        'https://fcm.googleapis.com/fcm/send/test-norma', 'p256dh-test', 'auth-test');

select public.t_assert(
  (select count(*) from public.push_subscriptions) = 1,
  'la suscripción push se registra para la familia');

-- 2) endpoint único: el mismo navegador no se duplica
do $$
begin
  insert into public.push_subscriptions (org_id, endpoint, p256dh, auth)
  values ((select public.current_org_id()),
          'https://fcm.googleapis.com/fcm/send/test-norma', 'x', 'y');
  raise exception 'no falló el unique de endpoint';
exception
  when unique_violation then null;
end $$;

select public.t_assert(true, 'el endpoint de una suscripción es único');

-- 3) app_secrets: ni siquiera se puede leer con sesión válida
do $$
begin
  perform count(*) from public.app_secrets;
  raise exception 'app_secrets quedó legible desde la API';
exception
  when insufficient_privilege then null;
end $$;

select public.t_assert(true, 'app_secrets es invisible para la API pública');

commit;

-- 4) Aislamiento RLS: la familia 2 no ve suscripciones ajenas
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u2_id')::text, true);

select public.t_assert(
  (select count(*) from public.push_subscriptions) = 0,
  'RLS: otra familia no ve suscripciones push ajenas');

commit;
