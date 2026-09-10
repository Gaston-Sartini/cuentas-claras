-- ============================================================================
-- CUENTAS CLARAS · 00011_recurring_due_day.sql
-- Día de vencimiento opcional para los gastos fijos ("el alquiler vence el 5").
--
--  · Alimenta la tarjeta de Vencimientos del Inicio y los avisos de la PWA.
--  · Si el mes es más corto que due_day (31 en un mes de 30), la app usa el
--    último día del mes.
-- ============================================================================

alter table public.recurring_expenses
  add column due_day int check (due_day between 1 and 31);

comment on column public.recurring_expenses.due_day is
  'Día del mes en que vence el fijo (1-31, null = sin aviso). La app ajusta al último día en meses cortos.';
