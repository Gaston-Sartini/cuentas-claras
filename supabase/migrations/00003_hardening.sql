-- ============================================================================
-- CUENTAS CLARAS · 00003_hardening.sql
-- Endurecimiento según los security advisors de Supabase:
--  · search_path fijo en TODAS las funciones (evita hijacking por search_path).
--  · Las funciones internas (triggers y helpers SECURITY DEFINER) se sacan de
--    la superficie de la API REST: nadie las puede llamar por /rest/v1/rpc.
--  · Las RPCs de usuario quedan sólo para `authenticated`.
--  · check_invite_code queda accesible para `anon` a propósito: el formulario
--    de registro la usa antes de crear la cuenta y sólo devuelve true/false.
-- ============================================================================

-- 1. search_path fijo en las funciones de trigger (mismo cuerpo, misma firma:
--    los triggers existentes siguen apuntando acá).
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.tg_transactions_rules()
returns trigger
language plpgsql
set search_path = public
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

-- 2. Funciones internas: fuera de la API. Los triggers no necesitan que el
--    caller tenga EXECUTE (corren con el dueño de la tabla), así que esto no
--    rompe nada.
revoke execute on function public.apply_wallet_delta(uuid, public.payment_method, numeric)
  from public, anon, authenticated;
revoke execute on function public.tg_transactions_wallet()
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at()
  from public, anon, authenticated;
revoke execute on function public.tg_transactions_rules()
  from public, anon, authenticated;

-- 3. Sólo usuarios logueados pueden resolver su org y usar las RPCs de la app.
revoke execute on function public.current_org_id() from anon;
revoke execute on function public.transfer_between_wallets(uuid, uuid, numeric, text) from anon;
revoke execute on function public.get_next_month_projection() from anon;
