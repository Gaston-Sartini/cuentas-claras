-- ============================================================================
-- CUENTAS CLARAS · 00012_push_subscriptions.sql
-- Push real: suscripciones Web Push por navegador + secretos del servidor.
--
--  · push_subscriptions: una fila por navegador suscripto (endpoint único).
--    La Edge Function send-reminders les manda los avisos de vencimientos
--    todas las mañanas, aunque la app esté cerrada.
--  · app_secrets: claves VAPID y secreto del cron. SIN políticas RLS y con
--    permisos revocados: solo la Edge Function (service role, que saltea RLS)
--    puede leerla. Los VALORES no viven en este archivo ni en git: se insertan
--    a mano en cada entorno (insert into app_secrets values ...).
--  · El cron (pg_cron + pg_net) también se agenda a mano en cada entorno
--    porque lleva la URL del proyecto y el secreto:
--      select cron.schedule('send-reminders-daily', '0 12 * * *', $$
--        select net.http_post(
--          url     := 'https://<ref>.supabase.co/functions/v1/send-reminders',
--          headers := jsonb_build_object('Authorization', 'Bearer <anon key>',
--                                        'x-cron-secret', '<cron_secret>'),
--          body    := '{}'::jsonb);
--      $$);
-- ============================================================================

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_org_id_idx on public.push_subscriptions (org_id);
comment on table public.push_subscriptions is
  'Suscripciones Web Push (una por navegador). La Edge Function send-reminders manda por acá los avisos de vencimientos.';

create trigger set_updated_at before update on public.push_subscriptions
  for each row execute function public.tg_set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: solo mi familia" on public.push_subscriptions
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

-- ----------------------------------------------------------------------------
-- Secretos del servidor: fuera del alcance de la API (ni anon ni authenticated)
-- ----------------------------------------------------------------------------
create table public.app_secrets (
  key        text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
comment on table public.app_secrets is
  'Claves VAPID y secreto del cron. Solo la lee la Edge Function con service role; la API pública no llega ni con RLS.';

alter table public.app_secrets enable row level security;
-- Sin políticas: RLS niega todo. Además, sin permisos de tabla:
revoke all on public.app_secrets from public, anon, authenticated;
