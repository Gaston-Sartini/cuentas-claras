-- ============================================================================
-- CUENTAS CLARAS · 00009_income_entries.sql
-- Ingresos con nombre ("Sueldo Yami", "Sueldo Gasti", "Plata que debía Nico").
--
--  · Reemplaza al número único de income_projections: ahora cada ingreso es un
--    ítem con descripción y monto, y el "Entra" de cada mes es la suma de los
--    ítems vigentes.
--  · Mismo modelo de vigencia que recurring_expenses: start_month .. end_month.
--    end_month NULL  => se repite todos los meses (sueldos).
--    end_month = start_month => ingreso puntual de un solo mes.
--  · income_projections queda como tabla legacy: sus montos se migran acá como
--    ingresos puntuales (misma suma por mes) y la app deja de escribirla.
-- ============================================================================

create table public.income_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null check (amount > 0),
  start_month date not null default date_trunc('month', now())::date
              check (start_month = date_trunc('month', start_month)::date),
  end_month   date check (
                end_month is null
                or (end_month = date_trunc('month', end_month)::date
                    and end_month >= start_month)
              ),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index income_entries_org_id_idx on public.income_entries (org_id);
comment on table public.income_entries is
  'Ingresos proyectados por ítem. end_month null = se repite todos los meses; end_month = start_month = ingreso puntual.';

create trigger set_updated_at before update on public.income_entries
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- Migración de datos: cada mes cargado en income_projections pasa a ser un
-- ingreso puntual de ese mes. La suma mensual queda idéntica a la que veía
-- la familia antes de actualizar.
-- ----------------------------------------------------------------------------
insert into public.income_entries (org_id, description, amount, start_month, end_month)
select org_id, 'Ingreso mensual', estimated_amount, month_year, month_year
from public.income_projections
where estimated_amount > 0;

-- RLS + Realtime (mismo esquema que el resto de las tablas org-scoped)
alter table public.income_entries enable row level security;

create policy "income_entries: solo mi familia" on public.income_entries
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

alter table public.income_entries replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.income_entries;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
