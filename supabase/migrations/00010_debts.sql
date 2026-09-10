-- ============================================================================
-- CUENTAS CLARAS · 00010_debts.sql
-- Deudas y préstamos con nombre: "Nico – plata del asado", "Cuota del club".
--
--  · direction = 'owed_to_us' (nos deben) | 'we_owe' (debemos).
--  · due_date opcional: alimenta la tarjeta de Vencimientos del Inicio.
--  · Saldar no borra: settled_at marca cuándo se cerró (la app lista solo
--    las activas, pero el historial queda en la tabla).
--  · No toca billeteras ni transacciones: es un recordatorio, el movimiento
--    real de plata se carga como gasto/ingreso cuando pasa.
-- ============================================================================

create table public.debts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null check (amount > 0),
  direction   text not null check (direction in ('owed_to_us', 'we_owe')),
  due_date    date,
  settled_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index debts_org_id_idx on public.debts (org_id);
comment on table public.debts is
  'Deudas informales de la familia. owed_to_us = nos deben; we_owe = debemos. settled_at marca la deuda como saldada.';

create trigger set_updated_at before update on public.debts
  for each row execute function public.tg_set_updated_at();

-- RLS + Realtime (mismo esquema que el resto de las tablas org-scoped)
alter table public.debts enable row level security;

create policy "debts: solo mi familia" on public.debts
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

alter table public.debts replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.debts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
