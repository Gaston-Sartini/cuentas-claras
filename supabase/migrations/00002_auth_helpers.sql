-- ============================================================================
-- CUENTAS CLARAS · 00002_auth_helpers.sql
-- Validación de códigos de invitación desde el formulario de registro.
--
-- El trigger handle_new_user crea una familia nueva si el invite_code no
-- existe (fallback). Para que un typo no deje a alguien en una familia
-- solitaria, el cliente valida el código ANTES de registrarse con esta RPC.
-- SECURITY DEFINER + grant a anon: sólo devuelve true/false, nunca datos.
-- ============================================================================

create or replace function public.check_invite_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations
    where invite_code = upper(trim(p_code))
  );
$$;

revoke all on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;
