-- NO APLICADO en ningún entorno. Aplicarlo, en producción o en staging,
-- requiere autorización expresa de Elvis.
--
-- Trabajo de pg_cron del cobro automático de cuotas (Fase 3): una vez al día,
-- a las 06:00 UTC (07:00 en Madrid en invierno, 08:00 en verano; 00:00 en
-- Ciudad de México), llama a /api/cron/collect-family-fees. Va antes de los
-- recordatorios de cuotas (16:00 UTC), así que el recordatorio del día ya ve
-- el resultado del cobro.
--
-- Este archivo es SOLO para producción: usa zaltyko_scheduler.call_cron de
-- 20261115_pg_cron_avisos.sql, que tiene fija la URL https://zaltyko.com
-- (línea 23). No ejecutarlo en staging: allí se usa la función propia que
-- describe docs/deployment/scheduler/README.md («Cobro automático de cuotas»).
--
-- Requisitos antes de aplicarlo: la candidata de la Fase 3 aplicada, la
-- bandera ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED decidida en Vercel y la
-- autorización de Elvis. Con la bandera apagada la ruta solo pone al día los
-- cobros que quedaron a medias y nunca cobra nada nuevo; con la clave de
-- Stripe que no es de test o contra la base de producción no hace nada (los
-- cerrojos de esta fase siguen en el código).
--
-- Sin secretos: el token lo pone call_cron desde Vault (zaltyko_cron_secret).
-- Se puede volver a ejecutar: cron.schedule con el mismo nombre actualiza el
-- trabajo existente en vez de crear otro.
-- Vuelta atrás: select cron.unschedule('zaltyko-collect-family-fees');
begin;
do $preflight$
begin
  if to_regprocedure('zaltyko_scheduler.call_cron(text)') is null then
    raise exception 'falta zaltyko_scheduler.call_cron: aplicar antes 20261115_pg_cron_avisos.sql';
  end if;
end;
$preflight$;
select cron.schedule('zaltyko-collect-family-fees', '0 6 * * *', $$select zaltyko_scheduler.call_cron('collect-family-fees')$$);
commit;
