-- ============================================================================
-- CUENTAS CLARAS · Migración inicial (00001_init.sql)
-- Target: Supabase (PostgreSQL 15+)
-- Ejecutar en el SQL Editor del proyecto (rol postgres) o con `supabase db push`.
--
-- Decisiones de diseño clave:
--  · Multi-tenant por org_id en TODAS las tablas, aislado con RLS.
--  · current_org_id(): intenta leer org_id del JWT (app_metadata) y cae al
--    perfil si no está. SECURITY DEFINER para evitar recursión de RLS.
--  · billing_month en transactions: mes al que imputa cada movimiento.
--    Tarjeta (mastercard/visa) => mes siguiente, automático por trigger.
--    Esto hace triviales el banner rojo y el cierre mensual.
--  · Los descuentos de billetera (efectivo / MercadoPago) viven en un trigger
--    de base de datos, no en el cliente: cualquier app que inserte una
--    transacción mantiene los saldos consistentes.
--  · Retiros de cajero = RPC transfer_between_wallets (atómico) que loguea
--    una transacción neutra kind='transfer' (no cuenta como gasto).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TIPOS
-- ----------------------------------------------------------------------------
create type public.payment_method    as enum ('mercadopago', 'cash', 'mastercard', 'visa');
create type public.transaction_status as enum ('settled', 'next_month');
create type public.transaction_kind   as enum ('expense', 'transfer');
create type public.wallet_type        as enum ('bank', 'mercadopago', 'cash', 'other');

-- ----------------------------------------------------------------------------
-- 2. TABLAS
-- ----------------------------------------------------------------------------

-- Familias / espacios compartidos
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique
              default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_at  timestamptz not null default now()
);
comment on table public.organizations is
  'Espacio compartido de una familia. invite_code se comparte para sumar miembros al registrarse.';

-- Perfiles (1:1 con auth.users)
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_org_id_idx on public.profiles (org_id);

-- Categorías (org_id NULL = categoría global por defecto, visible para todos)
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations (id) on delete cascade,
  name       text not null,
  icon       text not null default 'tag',   -- nombre de ícono lucide
  is_custom  boolean not null default true,
  created_at timestamptz not null default now()
);
create index categories_org_id_idx on public.categories (org_id);
create unique index categories_org_name_key
  on public.categories (org_id, lower(name)) where org_id is not null;
create unique index categories_global_name_key
  on public.categories (lower(name)) where org_id is null;

-- Billeteras / saldos
create table public.wallets (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  type            public.wallet_type not null default 'other',
  current_balance numeric(14,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index wallets_org_id_idx on public.wallets (org_id);
create unique index wallets_org_name_key on public.wallets (org_id, lower(name));
comment on column public.wallets.type is
  'bank | mercadopago | cash | other. Los triggers usan type (no name) para impactar saldos.';

-- Transacciones
create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  created_by     uuid references public.profiles (id) on delete set null,
  date           date not null default current_date,
  description    text not null,
  amount         numeric(14,2) not null check (amount > 0),
  category_id    uuid references public.categories (id) on delete set null,
  payment_method public.payment_method,
  status         public.transaction_status not null default 'settled',
  kind           public.transaction_kind not null default 'expense',
  billing_month  date,  -- primer día del mes al que imputa; lo completa el trigger
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint expense_needs_method check (kind <> 'expense' or payment_method is not null)
);
create index transactions_org_date_idx    on public.transactions (org_id, date desc);
create index transactions_org_billing_idx on public.transactions (org_id, billing_month);
create index transactions_category_idx    on public.transactions (category_id);
comment on column public.transactions.billing_month is
  'Mes contable del movimiento. Tarjetas: mes siguiente. Reportes y banner agrupan por acá.';

-- Cuotas
create table public.installments (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations (id) on delete cascade,
  description            text not null,
  total_installments     int not null check (total_installments between 1 and 120),
  current_installment    int not null default 1,
  amount_per_installment numeric(14,2) not null check (amount_per_installment > 0),
  payment_method         public.payment_method not null default 'visa',
  start_date             date not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint current_within_total check (current_installment between 1 and total_installments)
);
create index installments_org_id_idx on public.installments (org_id);
comment on column public.installments.start_date is
  'Mes en el que vence la cuota N°1. La cuota k vence en start_date + (k-1) meses. '
  'La app calcula start_date hacia atrás cuando el usuario carga "cuota 2 de 6".';

-- Proyección de ingresos
create table public.income_projections (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  month_year       date not null check (month_year = date_trunc('month', month_year)::date),
  estimated_amount numeric(14,2) not null default 0 check (estimated_amount >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, month_year)  -- habilita upsert: "repetir" y sobrescribir un mes puntual
);

-- ----------------------------------------------------------------------------
-- 3. FUNCIONES DE APOYO
-- ----------------------------------------------------------------------------

-- Org del usuario logueado: JWT app_metadata primero, perfil como fallback.
-- SECURITY DEFINER: lee profiles sin disparar RLS (evita recursión).
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif((select auth.jwt()) -> 'app_metadata' ->> 'org_id', '')::uuid,
    (select org_id from public.profiles where id = (select auth.uid()))
  );
$$;

revoke all on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated;

-- updated_at automático
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.wallets
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.transactions
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.installments
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.income_projections
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. REGLAS DE NEGOCIO EN TRIGGERS
-- ----------------------------------------------------------------------------

-- 4.a  Tarjeta => mes siguiente + cálculo de billing_month
create or replace function public.tg_transactions_rules()
returns trigger
language plpgsql
as $$
begin
  -- Compras nuevas con tarjeta entran sí o sí a la cuenta del mes que viene.
  -- Sólo en INSERT: el cierre mensual necesita poder pasar status a 'settled'.
  if tg_op = 'INSERT'
     and new.kind = 'expense'
     and new.payment_method in ('mastercard', 'visa') then
    new.status := 'next_month';
  end if;

  if new.billing_month is null then
    if new.status = 'next_month' then
      new.billing_month := (date_trunc('month', new.date) + interval '1 month')::date;
    else
      new.billing_month := date_trunc('month', new.date)::date;
    end if;
  end if;

  return new;
end;
$$;

create trigger transactions_rules
before insert or update on public.transactions
for each row execute function public.tg_transactions_rules();

-- 4.b  Impacto en billeteras (efectivo / MercadoPago)
create or replace function public.apply_wallet_delta(
  p_org uuid, p_method public.payment_method, p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_method is null or p_method not in ('cash', 'mercadopago') then
    return;  -- las tarjetas no tocan saldos: se pagan el mes siguiente
  end if;

  update public.wallets
     set current_balance = current_balance + p_delta,
         updated_at = now()
   where org_id = p_org
     and type = (case p_method when 'cash' then 'cash' else 'mercadopago' end)::public.wallet_type;
end;
$$;

create or replace function public.tg_transactions_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'expense' then
      perform public.apply_wallet_delta(new.org_id, new.payment_method, -new.amount);
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    -- Revierte el efecto viejo y aplica el nuevo: la edición queda consistente.
    if old.kind = 'expense' then
      perform public.apply_wallet_delta(old.org_id, old.payment_method, old.amount);
    end if;
    if new.kind = 'expense' then
      perform public.apply_wallet_delta(new.org_id, new.payment_method, -new.amount);
    end if;
    return new;

  else  -- DELETE: borrar un gasto devuelve la plata a la billetera
    if old.kind = 'expense' then
      perform public.apply_wallet_delta(old.org_id, old.payment_method, old.amount);
    end if;
    return old;
  end if;
end;
$$;

create trigger transactions_wallet
after insert or update or delete on public.transactions
for each row execute function public.tg_transactions_wallet();

-- 4.c  Alta de usuario: crea familia nueva o se suma con invite_code
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite text;
  v_org    uuid;
  v_role   text := 'member';
begin
  v_invite := nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '');

  if v_invite is not null then
    select id into v_org
      from public.organizations
     where invite_code = upper(v_invite);
  end if;

  if v_org is null then
    insert into public.organizations (name)
    values (coalesce(nullif(new.raw_user_meta_data ->> 'org_name', ''), 'Mi familia'))
    returning id into v_org;

    v_role := 'owner';

    -- Billeteras por defecto para cada familia nueva
    insert into public.wallets (org_id, name, type) values
      (v_org, 'Banco',       'bank'),
      (v_org, 'MercadoPago', 'mercadopago'),
      (v_org, 'Efectivo',    'cash');
  end if;

  insert into public.profiles (id, org_id, email, full_name, role)
  values (
    new.id,
    v_org,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    v_role
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5. RPCs
-- ----------------------------------------------------------------------------

-- 5.a  Transferencia entre billeteras (retiro de cajero: Banco -> Efectivo).
--      SECURITY INVOKER: la RLS del usuario aplica adentro de la función.
create or replace function public.transfer_between_wallets(
  p_from_wallet uuid,
  p_to_wallet   uuid,
  p_amount      numeric,
  p_description text default 'Transferencia entre billeteras'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_from uuid;
  v_org_to   uuid;
  v_tx       uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto tiene que ser mayor a cero';
  end if;
  if p_from_wallet = p_to_wallet then
    raise exception 'Elegí dos billeteras distintas';
  end if;

  select org_id into v_org_from from public.wallets where id = p_from_wallet for update;
  select org_id into v_org_to   from public.wallets where id = p_to_wallet   for update;

  if v_org_from is null or v_org_to is null or v_org_from <> v_org_to then
    raise exception 'Billetera inexistente o de otra cuenta';
  end if;

  update public.wallets
     set current_balance = current_balance - p_amount, updated_at = now()
   where id = p_from_wallet;

  update public.wallets
     set current_balance = current_balance + p_amount, updated_at = now()
   where id = p_to_wallet;

  -- Movimiento neutro: no es gasto, no descuenta dos veces (el trigger
  -- de billeteras ignora kind = 'transfer').
  insert into public.transactions
    (org_id, description, amount, payment_method, status, kind, date, created_by)
  values
    (v_org_from, p_description, p_amount, null, 'settled', 'transfer', current_date,
     (select auth.uid()))
  returning id into v_tx;

  return v_tx;
end;
$$;

grant execute on function public.transfer_between_wallets(uuid, uuid, numeric, text) to authenticated;

-- 5.b  Proyección del mes que viene (alimenta el banner rojo):
--      compras de tarjeta pendientes + cuotas que vencen el mes próximo.
create or replace function public.get_next_month_projection()
returns table (card_charges numeric, installment_charges numeric, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with next_month as (
    select (date_trunc('month', now()) + interval '1 month')::date as m
  ),
  cards as (
    select coalesce(sum(t.amount), 0) as v
    from public.transactions t, next_month nm
    where t.org_id = (select public.current_org_id())
      and t.kind = 'expense'
      and t.status = 'next_month'
      and t.billing_month = nm.m
  ),
  cuotas as (
    select coalesce(sum(i.amount_per_installment), 0) as v
    from public.installments i, next_month nm
    where i.org_id = (select public.current_org_id())
      and (
        (date_part('year', nm.m)  - date_part('year', i.start_date)) * 12
      + (date_part('month', nm.m) - date_part('month', i.start_date)) + 1
      )::int between 1 and i.total_installments
  )
  select cards.v, cuotas.v, cards.v + cuotas.v
  from cards, cuotas;
$$;

grant execute on function public.get_next_month_projection() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.organizations      enable row level security;
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.wallets            enable row level security;
alter table public.transactions       enable row level security;
alter table public.installments       enable row level security;
alter table public.income_projections enable row level security;

-- organizations: ver y renombrar sólo la propia (el alta la hace el trigger)
create policy "org: ver la propia" on public.organizations
  for select to authenticated
  using (id = (select public.current_org_id()));

create policy "org: editar la propia" on public.organizations
  for update to authenticated
  using (id = (select public.current_org_id()))
  with check (id = (select public.current_org_id()));

-- profiles: ver a los miembros de la familia, editar sólo el propio
create policy "profiles: ver la familia" on public.profiles
  for select to authenticated
  using (org_id = (select public.current_org_id()));

create policy "profiles: editar el propio" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and org_id = (select public.current_org_id()));

-- categories: las globales (org_id null) se ven, las propias se administran
create policy "categories: ver globales y propias" on public.categories
  for select to authenticated
  using (org_id is null or org_id = (select public.current_org_id()));

create policy "categories: crear propias" on public.categories
  for insert to authenticated
  with check (org_id = (select public.current_org_id()));

create policy "categories: editar propias" on public.categories
  for update to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

create policy "categories: borrar propias" on public.categories
  for delete to authenticated
  using (org_id = (select public.current_org_id()));

-- Tablas 100% org-scoped: una política única por tabla
create policy "wallets: solo mi familia" on public.wallets
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

create policy "transactions: solo mi familia" on public.transactions
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

create policy "installments: solo mi familia" on public.installments
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

create policy "income_projections: solo mi familia" on public.income_projections
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

-- ----------------------------------------------------------------------------
-- 7. SEEDS: categorías globales (íconos = nombres de lucide-react)
-- ----------------------------------------------------------------------------
insert into public.categories (org_id, name, icon, is_custom) values
  (null, 'Supermercado',  'shopping-cart',  false),
  (null, 'Comida afuera', 'utensils',       false),
  (null, 'Transporte',    'bus',            false),
  (null, 'Salud',         'heart-pulse',    false),
  (null, 'Servicios',     'plug-zap',       false),
  (null, 'Hogar',         'house',          false),
  (null, 'Ropa',          'shirt',          false),
  (null, 'Salidas',       'party-popper',   false),
  (null, 'Educación',     'graduation-cap', false),
  (null, 'Mascotas',      'paw-print',      false),
  (null, 'Regalos',       'gift',           false),
  (null, 'Otros',         'tag',            false);

-- ----------------------------------------------------------------------------
-- 8. REALTIME (Supabase)
-- ----------------------------------------------------------------------------
-- replica identity full: los payloads de UPDATE/DELETE traen la fila completa
alter table public.transactions       replica identity full;
alter table public.wallets            replica identity full;
alter table public.installments       replica identity full;
alter table public.categories         replica identity full;
alter table public.income_projections replica identity full;

do $$
begin
  alter publication supabase_realtime add table
    public.transactions,
    public.wallets,
    public.installments,
    public.categories,
    public.income_projections;
exception
  when duplicate_object then null;  -- ya estaban agregadas
  when undefined_object then null;  -- entorno sin publicación supabase_realtime
end $$;

-- ============================================================================
-- DOWN (rollback manual, revisar antes de correr en producción)
-- ============================================================================
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();
-- drop function if exists public.get_next_month_projection();
-- drop function if exists public.transfer_between_wallets(uuid, uuid, numeric, text);
-- drop function if exists public.tg_transactions_wallet();
-- drop function if exists public.apply_wallet_delta(uuid, public.payment_method, numeric);
-- drop function if exists public.tg_transactions_rules();
-- drop function if exists public.tg_set_updated_at() cascade;
-- drop function if exists public.current_org_id();
-- drop table if exists public.income_projections, public.installments,
--   public.transactions, public.wallets, public.categories,
--   public.profiles, public.organizations cascade;
-- drop type if exists public.wallet_type, public.transaction_kind,
--   public.transaction_status, public.payment_method;
