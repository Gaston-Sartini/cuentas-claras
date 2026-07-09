-- ============================================================================
-- CUENTAS CLARAS · 00008_category_budgets.sql
-- Presupuesto mensual por categoría: "Supermercado, tope $300.000/mes".
--
--  · Es la evolución del banner rojo como freno: en el resumen del mes, la
--    barra de cada categoría con tope se pinta según cuánto va consumido
--    (verde -> ámbar -> rojo) y muestra "gastado de tope".
--  · Un tope por categoría por familia. El monto aplica a todos los meses;
--    el consumo se calcula del lado del cliente contra los gastos del mes.
--  · Categoría global (org_id null) puede tener tope propio de cada familia,
--    por eso la unicidad es (org_id, category_id).
-- ============================================================================

create table public.category_budgets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  category_id    uuid not null references public.categories (id) on delete cascade,
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, category_id)
);
create index category_budgets_org_id_idx on public.category_budgets (org_id);
comment on table public.category_budgets is
  'Tope de gasto mensual por categoría. El consumo se calcula en el cliente contra los gastos del mes.';

create trigger set_updated_at before update on public.category_budgets
  for each row execute function public.tg_set_updated_at();

-- RLS + Realtime
alter table public.category_budgets enable row level security;

create policy "category_budgets: solo mi familia" on public.category_budgets
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

alter table public.category_budgets replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.category_budgets;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
