-- NO APLICADO en producción; aplicarlo requiere autorización expresa de
-- Elvis. En staging se programó el 25-11-2026 con call_cron_staging (ver
-- docs/deployment/scheduler/README.md).
--
-- Trabajo de retención de solicitudes de contacto: una vez al día, a las
-- 03:15 UTC (04:15 en Madrid en invierno, 05:15 en verano; 21:15 del día
-- anterior en Ciudad de México), llama a /api/cron/lead-retention. La ruta
-- borra leads no convertidos cuya última actividad vinculada supera seis
-- meses, por lotes transaccionales de 100, hasta 50 lotes por ejecución.
--
-- Este archivo es SOLO para producción: usa zaltyko_scheduler.call_cron de
-- 20261115_pg_cron_avisos.sql, que tiene fija la URL https://zaltyko.com. En
-- staging se programa con la función propia de staging que describe
-- docs/deployment/scheduler/README.md, con el mismo nombre de ruta.
--
-- Sin secretos: el token lo pone call_cron desde Vault (zaltyko_cron_secret).
-- Se puede volver a ejecutar: cron.schedule con el mismo nombre actualiza el
-- trabajo existente en vez de crear otro.
-- Vuelta atrás: select cron.unschedule('zaltyko-lead-retention');
begin;
do $preflight$
begin
  if to_regprocedure('zaltyko_scheduler.call_cron(text)') is null then
    raise exception 'falta zaltyko_scheduler.call_cron: aplicar antes 20261115_pg_cron_avisos.sql';
  end if;
end;
$preflight$;
select cron.schedule('zaltyko-lead-retention', '15 3 * * *', $$select zaltyko_scheduler.call_cron('lead-retention')$$);
commit;
