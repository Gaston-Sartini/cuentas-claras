-- ============================================================================
-- CUENTAS CLARAS · 00007_installments_category.sql
-- Categoría en las cuotas: el resumen mensual por categoría deja de perder
-- las compras en cuotas (antes solo aparecían en la proyección por tarjeta).
-- Nullable: las cuotas viejas quedan "Sin categoría" y se pueden completar.
-- ============================================================================

alter table public.installments
  add column category_id uuid references public.categories (id) on delete set null;
