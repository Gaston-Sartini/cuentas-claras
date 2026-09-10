-- ============================================================================
-- CUENTAS CLARAS · 00014_income_receipts.sql
-- A qué billetera entra cada ingreso, y el registro de cuándo entró de verdad.
--
--  · income_entries.wallet_id: dónde va a caer ese ingreso ("Sueldo Yami" ->
--    "BBVA Gasti"). Es parte de la proyección: todavía no movió un peso.
--  · income_receipts: una fila por (ingreso, mes) cuando la plata entró de
--    verdad. Un sueldo que se repite necesita marcarse mes a mes, por eso el
--    registro no es una columna en income_entries.
--  · El saldo lo mueve un trigger, igual que con los gastos: marcar "ya entró"
--    suma a la billetera y desmarcarlo lo devuelve. Así el saldo real sigue
--    siendo el que manda, que es lo que mira el "Para gastar" del Inicio.
--  · Por qué no se acredita solo al llegar el mes: el sueldo puede caer el 5,
--    venir distinto o no venir. Si la app lo diera por entrado, el saldo
--    dejaría de ser real — justo lo contrario de lo que se busca.
-- ============================================================================

alter table public.income_entries
  add column wallet_id uuid references public.wallets (id) on delete set null;

comment on column public.income_entries.wallet_id is
  'Billetera donde va a entrar este ingreso. Null = sin definir: al marcarlo como recibido no mueve ningún saldo.';

create table public.income_receipts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  income_entry_id uuid not null references public.income_entries (id) on delete cascade,
  month_year      date not null check (month_year = date_trunc('month', month_year)::date),
  amount          numeric(14,2) not null check (amount > 0),
  wallet_id       uuid references public.wallets (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, income_entry_id, month_year)  -- un ingreso entra una vez por mes
);
create index income_receipts_org_month_idx on public.income_receipts (org_id, month_year);
comment on table public.income_receipts is
  'Ingresos que ya entraron de verdad, uno por (ingreso, mes). El trigger suma el monto a la billetera.';

create trigger set_updated_at before update on public.income_receipts
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- El saldo se mueve en la base, no en el cliente (misma regla que los gastos)
-- ----------------------------------------------------------------------------
create or replace function public.apply_wallet_delta_by_id(
  p_org uuid, p_wallet uuid, p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_wallet is null then
    return;  -- ingreso sin billetera definida: no mueve saldos
  end if;

  update public.wallets
     set current_balance = current_balance + p_delta,
         updated_at = now()
   where id = p_wallet and org_id = p_org;
end;
$$;
revoke execute on function public.apply_wallet_delta_by_id(uuid, uuid, numeric)
  from public, anon, authenticated;

create or replace function public.tg_income_receipts_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Revierte lo viejo (desmarcar o editar devuelve la plata)
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.apply_wallet_delta_by_id(old.org_id, old.wallet_id, -old.amount);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.apply_wallet_delta_by_id(new.org_id, new.wallet_id, new.amount);
    return new;
  end if;

  return old;
end;
$$;
revoke execute on function public.tg_income_receipts_wallet() from public, anon, authenticated;

create trigger income_receipts_wallet
after insert or update or delete on public.income_receipts
for each row execute function public.tg_income_receipts_wallet();

-- RLS + Realtime
alter table public.income_receipts enable row level security;

create policy "income_receipts: solo mi familia" on public.income_receipts
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

alter table public.income_receipts replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.income_receipts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
