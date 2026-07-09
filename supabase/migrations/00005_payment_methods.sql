-- ============================================================================
-- CUENTAS CLARAS · 00005_payment_methods.sql
-- Medios de pago propios de cada familia ("Visa Gasti", "Amex Yami", ...).
--
--  · kind = 'credit': la compra va a la cuenta del mes que viene (como antes
--    Visa/Mastercard). kind = 'debit': descuenta al instante la billetera
--    linkeada (como antes Efectivo/MercadoPago, pero ahora linkeable a
--    cualquier billetera, ej: "Visa débito Gasti" -> "BBVA Gasti").
--  · El enum payment_method queda como dato legacy: las filas viejas lo
--    conservan y los triggers siguen entendiéndolo. Las filas nuevas usan
--    payment_method_id.
--  · Cada familia arranca con los 4 métodos clásicos, creados por el trigger
--    de alta de usuario y backfilleados para las familias existentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA
-- ----------------------------------------------------------------------------
create type public.method_kind as enum ('debit', 'credit');

create table public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null,
  kind       public.method_kind not null,
  wallet_id  uuid references public.wallets (id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debit_needs_wallet check (kind <> 'debit' or wallet_id is not null)
);
create index payment_methods_org_id_idx on public.payment_methods (org_id);
create unique index payment_methods_org_name_key
  on public.payment_methods (org_id, lower(name));
comment on table public.payment_methods is
  'Medios de pago de la familia. credit => imputa al mes siguiente; debit => descuenta wallet_id al instante.';

create trigger set_updated_at before update on public.payment_methods
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. COLUMNAS NUEVAS + CONSTRAINT RELAJADA
-- ----------------------------------------------------------------------------
alter table public.transactions
  add column payment_method_id uuid references public.payment_methods (id) on delete set null;
create index transactions_method_idx on public.transactions (payment_method_id);

alter table public.installments
  add column payment_method_id uuid references public.payment_methods (id) on delete set null;

-- Un gasto necesita método: el legacy (enum) o el nuevo (FK)
alter table public.transactions drop constraint expense_needs_method;
alter table public.transactions add constraint expense_needs_method
  check (kind <> 'expense' or payment_method is not null or payment_method_id is not null);

-- ----------------------------------------------------------------------------
-- 3. SEED: 4 métodos clásicos por familia (nuevas y existentes)
-- ----------------------------------------------------------------------------
create or replace function public.seed_default_methods(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payment_methods (org_id, name, kind, wallet_id, is_default)
  select p_org, v.name, v.kind::public.method_kind,
         case when v.wtype is null then null
              else (select id from public.wallets
                     where org_id = p_org and type = v.wtype::public.wallet_type
                     order by created_at limit 1)
         end,
         true
  from (values
    ('Efectivo',    'debit',  'cash'),
    ('MercadoPago', 'debit',  'mercadopago'),
    ('Visa',        'credit', null),
    ('Mastercard',  'credit', null)
  ) as v(name, kind, wtype)
  on conflict do nothing;
end;
$$;
revoke execute on function public.seed_default_methods(uuid) from public, anon, authenticated;

-- Familias existentes
select public.seed_default_methods(id) from public.organizations;

-- Backfill de filas viejas: enum -> método por defecto equivalente
update public.transactions t
   set payment_method_id = m.id
  from public.payment_methods m
 where t.payment_method_id is null
   and t.payment_method is not null
   and m.org_id = t.org_id
   and m.is_default
   and lower(m.name) = case t.payment_method
                         when 'cash' then 'efectivo'
                         when 'mercadopago' then 'mercadopago'
                         when 'visa' then 'visa'
                         when 'mastercard' then 'mastercard'
                       end;

update public.installments i
   set payment_method_id = m.id
  from public.payment_methods m
 where i.payment_method_id is null
   and m.org_id = i.org_id
   and m.is_default
   and lower(m.name) = case i.payment_method
                         when 'cash' then 'efectivo'
                         when 'mercadopago' then 'mercadopago'
                         when 'visa' then 'visa'
                         when 'mastercard' then 'mastercard'
                       end;

-- Alta de usuario: además de billeteras, la familia nueva arranca con los 4 métodos
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

    insert into public.wallets (org_id, name, type) values
      (v_org, 'Banco',       'bank'),
      (v_org, 'MercadoPago', 'mercadopago'),
      (v_org, 'Efectivo',    'cash');

    perform public.seed_default_methods(v_org);
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
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. TRIGGERS DE NEGOCIO: entienden ambos mundos (enum legacy y método nuevo)
-- ----------------------------------------------------------------------------
create or replace function public.tg_transactions_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind public.method_kind;
begin
  if new.payment_method_id is not null then
    -- El método tiene que ser de la misma familia que el gasto
    select kind into v_kind
      from public.payment_methods
     where id = new.payment_method_id and org_id = new.org_id;
    if v_kind is null then
      raise exception 'Medio de pago inexistente o de otra cuenta';
    end if;
  end if;

  -- Compras nuevas con crédito entran sí o sí a la cuenta del mes que viene.
  -- Sólo en INSERT: el cierre mensual necesita poder pasar status a 'settled'.
  if tg_op = 'INSERT'
     and new.kind = 'expense'
     and (v_kind = 'credit' or new.payment_method in ('mastercard', 'visa')) then
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
revoke execute on function public.tg_transactions_rules() from public, anon, authenticated;

-- Débito nuevo: descuenta la billetera linkeada al método
create or replace function public.apply_wallet_delta_by_method(
  p_org uuid, p_method_id uuid, p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallets w
     set current_balance = w.current_balance + p_delta,
         updated_at = now()
    from public.payment_methods m
   where m.id = p_method_id
     and m.org_id = p_org
     and m.kind = 'debit'
     and w.id = m.wallet_id
     and w.org_id = p_org;
end;
$$;
revoke execute on function public.apply_wallet_delta_by_method(uuid, uuid, numeric)
  from public, anon, authenticated;

create or replace function public.tg_transactions_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.kind = 'expense' then
    -- Revierte el efecto viejo (edición o borrado devuelven la plata)
    if old.payment_method_id is not null then
      perform public.apply_wallet_delta_by_method(old.org_id, old.payment_method_id, old.amount);
    else
      perform public.apply_wallet_delta(old.org_id, old.payment_method, old.amount);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.kind = 'expense' then
    if new.payment_method_id is not null then
      perform public.apply_wallet_delta_by_method(new.org_id, new.payment_method_id, -new.amount);
    else
      perform public.apply_wallet_delta(new.org_id, new.payment_method, -new.amount);
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;
revoke execute on function public.tg_transactions_wallet() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. CIERRE MENSUAL: también paga las tarjetas de crédito nuevas
-- ----------------------------------------------------------------------------
create or replace function public.settle_card_month(
  p_month  date,
  p_wallet uuid default null
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_total numeric;
begin
  with pagadas as (
    update public.transactions t
       set status = 'settled'
     where t.org_id = (select public.current_org_id())
       and t.kind = 'expense'
       and t.status = 'next_month'
       and (
         t.payment_method in ('mastercard', 'visa')
         or exists (select 1 from public.payment_methods m
                     where m.id = t.payment_method_id and m.kind = 'credit')
       )
       and t.billing_month = v_month
    returning t.amount
  )
  select coalesce(sum(amount), 0) into v_total from pagadas;

  if v_total > 0 and p_wallet is not null then
    update public.wallets
       set current_balance = current_balance - v_total,
           updated_at = now()
     where id = p_wallet;

    if not found then
      raise exception 'Billetera inexistente o de otra cuenta';
    end if;
  end if;

  return v_total;
end;
$$;
revoke all on function public.settle_card_month(date, uuid) from public, anon;
grant execute on function public.settle_card_month(date, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RLS + REALTIME
-- ----------------------------------------------------------------------------
alter table public.payment_methods enable row level security;

create policy "payment_methods: solo mi familia" on public.payment_methods
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

alter table public.payment_methods replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.payment_methods;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
