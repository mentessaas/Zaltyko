begin;
-- Llamada autenticada a una ruta de avisos de zaltyko.com. El secreto vive
-- cifrado en Vault (zaltyko_cron_secret); aquí no aparece.
create schema if not exists zaltyko_scheduler;
revoke all on schema zaltyko_scheduler from public, anon, authenticated;
create or replace function zaltyko_scheduler.call_cron(route text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  secret text;
begin
  if route !~ '^[a-z-]+$' then
    raise exception 'ruta de aviso no válida: %', route;
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'zaltyko_cron_secret';
  if secret is null then
    raise exception 'falta el secreto zaltyko_cron_secret en Vault';
  end if;
  return net.http_post(
    url := 'https://zaltyko.com/api/cron/' || route,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 300000
  );
end;
$fn$;
revoke all on function zaltyko_scheduler.call_cron(text) from public, anon, authenticated;

select cron.schedule('zaltyko-coach-session-reminders', '*/5 * * * *', $$select zaltyko_scheduler.call_cron('coach-session-reminders')$$);
select cron.schedule('zaltyko-family-notices', '*/10 * * * *', $$select zaltyko_scheduler.call_cron('family-notices')$$);
select cron.schedule('zaltyko-owner-weekly-digest', '7 * * * *', $$select zaltyko_scheduler.call_cron('owner-weekly-digest')$$);
select cron.schedule('zaltyko-usage-at-risk', '0 7 * * *', $$select zaltyko_scheduler.call_cron('usage-at-risk')$$);
select cron.schedule('zaltyko-family-payment-reminders', '0 16 * * *', $$select zaltyko_scheduler.call_cron('family-payment-reminders')$$);
-- Limpieza del historial de ejecuciones (más de 14 días).
select cron.schedule('zaltyko-cron-history-cleanup', '30 3 * * 0', $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$);
commit;
