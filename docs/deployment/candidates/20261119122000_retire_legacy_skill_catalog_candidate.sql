-- CANDIDATE ONLY. Requiere autorización expresa de Elvis antes de cualquier
-- aplicación alojada (staging o producción), una por entorno. No aplicado en
-- ningún entorno. No está en supabase/migrations a propósito.
-- Decisión: ADR-0029 §7 (docs/architecture/adr/0029-biblioteca-de-elementos-y-niveles.md).
--
-- Qué hace: borra las tres tablas antiguas de elementos y puntuaciones del
-- esquema legacy (public), que ya no usa ningún código (la PR de retirada quitó
-- las escrituras y lecturas de las rutas /api/assessments, el formulario
-- antiguo y las semillas):
--   1. public.assessment_scores (puntuación por elemento de una evaluación;
--      FK skill_id -> skill_catalog).
--   2. public.athlete_skills (observaciones por elemento; FK skill_id ->
--      skill_catalog).
--   3. public.skill_catalog (catálogo antiguo por cuenta).
-- El orden respeta las claves foráneas: primero las dos tablas que apuntan a
-- skill_catalog y al final skill_catalog. Sin CASCADE: si otro objeto depende
-- de alguna de ellas, el DROP falla y la transacción entera se deshace.
--
-- Solo borra tablas VACÍAS. Antes de borrar, bloquea las tablas que existan y
-- cuenta sus filas; si alguna tiene filas, aborta sin borrar nada y muestra el
-- recuento por tabla. Las evaluaciones (athlete_assessments) y sus vídeos no se
-- tocan.
--
-- Recuento previo por tabla y academia (solo lectura; ejecutar antes y guardar
-- el resultado en el informe, sin copiar datos personales). skill_catalog no
-- tiene academia: se agrupa por cuenta (tenant_id). Si alguna de las tablas no
-- existe en el entorno, quitar su bloque de la consulta.
--   select 'assessment_scores' as tabla, s.tenant_id, aa.academy_id, count(*) as filas
--   from public.assessment_scores s
--   left join public.athlete_assessments aa on aa.id = s.assessment_id
--   group by s.tenant_id, aa.academy_id
--   union all
--   select 'athlete_skills', tenant_id, academy_id, count(*)
--   from public.athlete_skills
--   group by tenant_id, academy_id
--   union all
--   select 'skill_catalog', tenant_id, null::uuid, count(*)
--   from public.skill_catalog
--   group by tenant_id
--   order by 1, 2, 3;
--
-- Si aborta porque hay filas (ADR-0029 §7.4): no se ha borrado nada. Se
-- informa a Elvis del recuento por tabla y academia (la consulta de arriba);
-- las tablas se quedan como están, sin código que las use. Elvis decide
-- exportarlas o conservarlas, y solo entonces se escribe otra candidata. Esta
-- no se edita para saltarse la comprobación.
--
-- Orden en la PR que la aplique, para no romper el esquema Drizzle:
--   1. Aplicar este SQL en el entorno autorizado.
--   2. En la misma PR, quitar de src/db/schema assessment-scores.ts,
--      athlete-skills.ts y skill-catalog.ts (y sus exportaciones), y las
--      referencias de RLS y de CI a esas tablas. Hoy se conservan porque la base
--      alojada aún las tiene: quitarlas del esquema antes que de la base crearía
--      deriva.
--
-- Protección: la migración aborta salvo que la sesión confirme la intención con
--   set local zaltyko.retire_legacy_skill_catalog = 'confirmado';
-- dentro de la misma transacción.
begin;

set local lock_timeout = '5s';

do $retire_legacy_skill_catalog_preflight$
declare
  v_assessment_scores bigint := 0;
  v_athlete_skills bigint := 0;
  v_skill_catalog bigint := 0;
begin
  if coalesce(current_setting('zaltyko.retire_legacy_skill_catalog', true), '') <> 'confirmado' then
    raise exception
      'Candidata destructiva: confirmar con set local zaltyko.retire_legacy_skill_catalog = ''confirmado'' tras revisar el recuento previo';
  end if;

  if to_regclass('public.assessment_scores') is null
     and to_regclass('public.athlete_skills') is null
     and to_regclass('public.skill_catalog') is null then
    raise exception 'Nada que retirar: el entorno no tiene las tablas antiguas de elementos (¿ya aplicada?)';
  end if;

  -- Bloqueo antes de contar: nadie puede escribir entre el recuento y el DROP.
  if to_regclass('public.assessment_scores') is not null then
    execute 'lock table public.assessment_scores in access exclusive mode';
    execute 'select count(*) from public.assessment_scores' into v_assessment_scores;
  end if;
  if to_regclass('public.athlete_skills') is not null then
    execute 'lock table public.athlete_skills in access exclusive mode';
    execute 'select count(*) from public.athlete_skills' into v_athlete_skills;
  end if;
  if to_regclass('public.skill_catalog') is not null then
    execute 'lock table public.skill_catalog in access exclusive mode';
    execute 'select count(*) from public.skill_catalog' into v_skill_catalog;
  end if;

  if v_assessment_scores > 0 or v_athlete_skills > 0 or v_skill_catalog > 0 then
    raise exception
      'Hay filas en las tablas antiguas; no se borra nada. assessment_scores=%, athlete_skills=%, skill_catalog=%',
      v_assessment_scores, v_athlete_skills, v_skill_catalog
      using hint = 'Ejecutar el recuento por tabla y academia de la cabecera e informar a Elvis (ADR-0029 §7.4).';
  end if;
end
$retire_legacy_skill_catalog_preflight$;

drop table if exists public.assessment_scores;
drop table if exists public.athlete_skills;
drop table if exists public.skill_catalog;

commit;
