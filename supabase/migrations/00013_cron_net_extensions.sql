-- ============================================================================
-- CUENTAS CLARAS · 00013_cron_net_extensions.sql
-- Extensiones del push diario, y por qué sus permisos quedan como están.
--
--  · pg_cron + pg_net son lo que dispara la Edge Function send-reminders todas
--    las mañanas. Van acá para que un entorno nuevo se levante completo; en
--    un Postgres pelado (la suite de tests en Docker) no existen, y el DO
--    las saltea sin romper nada.
--
--  · Nota de seguridad, chequeada contra el proyecto real: ambas extensiones
--    dejan sus funciones con EXECUTE para anon/authenticated, y `net` además
--    da USAGE del schema a esos roles. Suena feo (`net.http_post` es un SSRF
--    con patas), pero NO hay camino desde la API: PostgREST sólo expone
--    `public` y `graphql_public`, así que un token de la app recibe
--    "Invalid schema: net" (PGRST106). Los objetos son de `supabase_admin`,
--    de modo que un `revoke` corrido como `postgres` es un no-op silencioso:
--    no se deja acá para no fingir una protección que no aplica. Si algún día
--    se expone otro schema en PostgREST, revisar esto primero.
-- ============================================================================

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception
  when others then
    raise notice
      'pg_cron/pg_net no disponibles en este entorno: el push diario solo se agenda en Supabase';
end $$;

-- El job en sí se agenda a mano por entorno (lleva URL y secretos): ver la
-- cabecera de 00012_push_subscriptions.sql.
