\set ON_ERROR_STOP on

select invite_code as c from public.organizations limit 1
\gset

begin;
set local role anon;

select public.t_assert(
  public.check_invite_code(lower(:'c')) = true,
  'codigo valido (case-insensitive) => true');

select public.t_assert(
  public.check_invite_code('ZZZZ9999') = false,
  'codigo inexistente => false');

commit;
