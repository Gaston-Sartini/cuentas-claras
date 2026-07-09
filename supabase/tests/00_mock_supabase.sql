-- Mock mínimo del entorno Supabase para validar la migración localmente
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;

create publication supabase_realtime;

grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function auth.jwt() to authenticated, anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
