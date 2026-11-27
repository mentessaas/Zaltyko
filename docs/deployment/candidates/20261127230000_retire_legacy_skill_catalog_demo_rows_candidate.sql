-- CANDIDATE ONLY. Requiere autorización expresa de Elvis antes de cualquier
-- aplicación alojada, una por entorno.
-- Solo para producción. Staging ya no tiene las tablas antiguas (aplicada
-- 20261119122000 el 19-11-2026).
-- No está en supabase/migrations a propósito.
-- Decisión: ADR-0029 §7.4. El 27-11-2026, 20261119122000 habría abortado en
-- producción: public.skill_catalog tenía 6 filas. Elvis revisó el recuento y
-- decidió borrarlas ("Sí, bórralas", 27-11-2026). Esta candidata sustituye a
-- 20261119122000 solo en producción; aquella no se edita.
--
-- Qué había en producción el 27-11-2026 (recuento previo, sin datos personales):
--   public.athlete_skills     no existe
--   public.assessment_scores  0 filas
--   public.skill_catalog      6 filas, todas de la cuenta de demostración
--     11111111-0000-0000-0000-000000000000, que no tiene academias: tres
--     elementos de ejemplo (FX-A1, BB-B1, UB-C1) creados dos veces, el 10 y el
--     11 de noviembre de 2025. Ninguna fila apunta a ellos.
--
-- Qué hace, en una sola transacción:
--   1. Bloquea las tablas antiguas que existan.
--   2. Aborta sin tocar nada si assessment_scores o athlete_skills tienen filas,
--      si skill_catalog no tiene exactamente esas 6 filas de la cuenta de
--      demostración, o si esa cuenta tiene alguna academia.
--   3. Borra las 6 filas y retira assessment_scores, athlete_skills (si existe)
--      y skill_catalog, sin CASCADE.
--
-- Vuelta atrás: no hay. Las filas eran de demostración; las definiciones de las
-- tablas siguen en supabase/migrations y en el snapshot de esquema.
--
-- Protección: la confirmación se fija a nivel de sesión antes de ejecutar.
--   set zaltyko.retire_legacy_skill_catalog_demo = 'confirmado';
--   \i docs/deployment/candidates/20261127230000_retire_legacy_skill_catalog_demo_rows_candidate.sql
--   reset zaltyko.retire_legacy_skill_catalog_demo;
begin;

set local lock_timeout = '5s';

do $retire_legacy_skill_catalog_demo_preflight$
declare
  v_demo constant uuid := '11111111-0000-0000-0000-000000000000';
  v_assessment_scores bigint := 0;
  v_athlete_skills bigint := 0;
  v_catalog_total bigint := 0;
  v_catalog_demo bigint := 0;
  v_demo_academies bigint := 0;
begin
  if coalesce(current_setting('zaltyko.retire_legacy_skill_catalog_demo', true), '') <> 'confirmado' then
    raise exception
      'Candidata destructiva: confirmar antes con set zaltyko.retire_legacy_skill_catalog_demo = ''confirmado'' (secuencia en la cabecera)';
  end if;

  if to_regclass('public.skill_catalog') is null then
    raise exception 'Nada que retirar: public.skill_catalog no existe (¿ya aplicada?)';
  end if;

  if to_regclass('public.assessment_scores') is not null then
    execute 'lock table public.assessment_scores in access exclusive mode';
    execute 'select count(*) from public.assessment_scores' into v_assessment_scores;
  end if;
  if to_regclass('public.athlete_skills') is not null then
    execute 'lock table public.athlete_skills in access exclusive mode';
    execute 'select count(*) from public.athlete_skills' into v_athlete_skills;
  end if;
  execute 'lock table public.skill_catalog in access exclusive mode';
  execute 'select count(*) from public.skill_catalog' into v_catalog_total;
  execute 'select count(*) from public.skill_catalog where tenant_id = $1' into v_catalog_demo using v_demo;
  select count(*) into v_demo_academies from public.academies where tenant_id = v_demo;

  if v_assessment_scores > 0 or v_athlete_skills > 0
     or v_catalog_total <> 6 or v_catalog_demo <> 6 or v_demo_academies > 0 then
    raise exception
      'El estado no es el revisado; no se borra nada. assessment_scores=%, athlete_skills=%, skill_catalog=% (demo=%), academias demo=%',
      v_assessment_scores, v_athlete_skills, v_catalog_total, v_catalog_demo, v_demo_academies;
  end if;

  execute 'delete from public.skill_catalog where tenant_id = $1' using v_demo;
end
$retire_legacy_skill_catalog_demo_preflight$;

drop table if exists public.assessment_scores;
drop table if exists public.athlete_skills;
drop table public.skill_catalog;

commit;
