-- NO APLICADO en ningún entorno. Aplicarlo, en producción o en staging,
-- requiere autorización expresa de Elvis.
--
-- Trabajo de pg_cron de la conservación de los avisos sobre contenido
-- (ADR-0029 §8.2): una vez al día, a las 03:15 UTC (04:15 en Madrid en
-- invierno, 05:15 en verano; 21:15 del día anterior en Ciudad de México),
-- llama a /api/cron/content-notices-retention. La ruta borra nombre y correo
-- de quien avisó en los avisos cerrados hace más de 730 días, por lotes de
-- 100, y responde solo contadores. Sin la tabla de avisos no hace nada.
--
-- Este archivo es SOLO para producción: usa zaltyko_scheduler.call_cron de
-- 20261115_pg_cron_avisos.sql, que tiene fija la URL https://zaltyko.com. En
-- staging se programa con la función propia de staging que describe
-- docs/deployment/scheduler/README.md, con el mismo nombre de ruta.
--
-- Requisitos antes de aplicarlo: la candidata de la biblioteca
-- (docs/deployment/candidates/20261119120000_element_library_candidate.sql)
-- aplicada y la autorización de Elvis.
--
-- Sin secretos: el token lo pone call_cron desde Vault (zaltyko_cron_secret).
-- Se puede volver a ejecutar: cron.schedule con el mismo nombre actualiza el
-- trabajo existente en vez de crear otro.
-- Vuelta atrás: select cron.unschedule('zaltyko-content-notices-retention');
begin;
do $preflight$
begin
  if to_regprocedure('zaltyko_scheduler.call_cron(text)') is null then
    raise exception 'falta zaltyko_scheduler.call_cron: aplicar antes 20261115_pg_cron_avisos.sql';
  end if;
end;
$preflight$;
select cron.schedule('zaltyko-content-notices-retention', '15 3 * * *', $$select zaltyko_scheduler.call_cron('content-notices-retention')$$);
commit;
