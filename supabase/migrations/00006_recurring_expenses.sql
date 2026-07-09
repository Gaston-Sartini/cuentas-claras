-- ============================================================================
-- CUENTAS CLARAS · 00006_recurring_expenses.sql
-- Gastos fijos mensuales (expensas, alquiler, luz...).
--
--  · Son ítems de PROYECCIÓN, no transacciones: avisan cuánto va a venir cada
--    mes. Cuando llega el mes y se paga de verdad, se carga el gasto normal
--    (efectivo/débito) — así no se cuenta dos veces ni se inventa un pago.
--  · Vigencia por rango de meses: start_month .. end_month (null = sigue).
--  · El banner rojo pasa a sumar tres patas: tarjetas + cuotas + fijos.
--    Cambia el tipo de retorno de get_next_month_projection => drop + create.
-- ============================================================================

create table public.recurring_expenses (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  description       text not null,
  amount            numeric(14,2) not null check (amount > 0),
  category_id       uuid references public.categories (id) on delete set null,
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  start_month       date not null default date_trunc('month', now())::date
                    check (start_month = date_trunc('month', start_month)::date),
  end_month         date check (
                      end_month is null
                      or (end_month = date_trunc('month', end_month)::date and end_month >= start_month)
                    ),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index recurring_expenses_org_id_idx on public.recurring_expenses (org_id);
comment on table public.recurring_expenses is
  'Gastos fijos mensuales: proyectan lo que va a venir. No mueven billeteras; el pago real se carga como gasto común.';

create trigger set_updated_at before update on public.recurring_expenses
  for each row execute function public.tg_set_updated_at();

-- Banner rojo: tarjetas + cuotas + fijos del mes que viene.
-- El tipo de retorno cambia, así que hay que dropear la versión anterior.
drop function if exists public.get_next_month_projection();

create or replace function public.get_next_month_projection()
returns table (
  card_charges        numeric,
  installment_charges numeric,
  recurring_charges   numeric,
  total               numeric
)
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
  ),
  fijos as (
    select coalesce(sum(r.amount), 0) as v
    from public.recurring_expenses r, next_month nm
    where r.org_id = (select public.current_org_id())
      and r.start_month <= nm.m
      and (r.end_month is null or r.end_month >= nm.m)
  )
  select cards.v, cuotas.v, fijos.v, cards.v + cuotas.v + fijos.v
  from cards, cuotas, fijos;
$$;

revoke all on function public.get_next_month_projection() from public, anon;
grant execute on function public.get_next_month_projection() to authenticated;

-- RLS + Realtime
alter table public.recurring_expenses enable row level security;

create policy "recurring_expenses: solo mi familia" on public.recurring_expenses
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

alter table public.recurring_expenses replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.recurring_expenses;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
