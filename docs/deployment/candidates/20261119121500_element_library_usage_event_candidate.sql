-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging o producción). No aplicado en ningún entorno.
-- Biblioteca de elementos, uso habitual (ADR-0029 §11): un tipo de evento
-- nuevo, `element_library_view` (consultas a la biblioteca), en la tabla de
-- contadores de uso `public.usage_events`.
-- Requiere antes la candidata del uso habitual
-- (20261114130000_habitual_use_candidate.sql), con la restricción de tipos de
-- evento tal cual la instala esa candidata. Puede no estar en todos los
-- entornos: si falta la tabla, este archivo aborta sin tocar nada.
--
-- Solo cambia `usage_events_event_name_check`, que pasa de admitir
-- 'staff_visit' y 'family_portal_view' a admitir también
-- 'element_library_view'. No cambia filas ni columnas. No toca
-- `usage_events_role_event_check`: solo 'family_portal_view' es de familias,
-- así que una consulta a la biblioteca solo se cuenta para el equipo (owner,
-- manager, admin, coach), nunca para una familia.
--
-- Qué guarda el evento nuevo: lo mismo que los demás, un contador por
-- academia, rol y día, sin identificar a nadie (actor_ref vacío).
--
-- Sin esta candidata la biblioteca funciona igual y no cuenta las consultas:
-- la restricción rechaza el evento y el registro, que nunca lanza, devuelve
-- false.
--
-- El archivo abre y cierra su propia transacción, con lock_timeout: si no
-- obtiene el bloqueo, no cambia nada. Reinstalar aborta antes de tocar nada
-- (la restricción ya no tiene la forma de partida): una instalación parcial o
-- divergente exige reconciliación humana, nunca reparación. La vuelta atrás
-- va comentada al final y no se ejecuta con este archivo.
begin;

set local lock_timeout = '5s';

do $element_library_usage_event_candidate_preflight$
begin
  if to_regclass('public.usage_events') is null then
    raise exception 'Element library usage event candidate requires public.usage_events from the habitual use candidate (20261114130000) installed first';
  end if;
  -- La restricción tal como la escribe PostgreSQL después de instalar la
  -- candidata del uso habitual: `check (event_name in ('staff_visit',
  -- 'family_portal_view'))`.
  if (
    select pg_get_constraintdef(oid)
      from pg_constraint
     where conrelid = to_regclass('public.usage_events')
       and conname = 'usage_events_event_name_check'
       and contype = 'c'
  ) is distinct from 'CHECK ((event_name = ANY (ARRAY[''staff_visit''::text, ''family_portal_view''::text])))' then
    raise exception 'Element library usage event candidate requires usage_events_event_name_check exactly as the habitual use candidate (20261114130000) installs it; inspect existing schema before promotion';
  end if;
end;
$element_library_usage_event_candidate_preflight$;

-- Las filas que ya hay son de los dos tipos anteriores: el check nuevo las
-- acepta todas.
alter table public.usage_events
  drop constraint usage_events_event_name_check,
  add constraint usage_events_event_name_check
    check (event_name in ('staff_visit', 'family_portal_view', 'element_library_view'));

commit;

-- VUELTA ATRÁS. Comentada: no se ejecuta con este archivo y requiere la misma
-- autorización de Elvis. Borra los contadores de consultas a la biblioteca
-- (solo contadores, ningún dato de la academia depende de ellos) y deja la
-- restricción exactamente como la instaló la candidata del uso habitual
-- (tests/element-library-usage-event-pg.test.ts lo comprueba ejecutando este
-- bloque). Después la biblioteca sigue funcionando sin contar.
-- >>> vuelta atrás
-- begin;
-- set local lock_timeout = '5s';
-- delete from public.usage_events where event_name = 'element_library_view';
-- alter table public.usage_events
--   drop constraint usage_events_event_name_check,
--   add constraint usage_events_event_name_check
--     check (event_name in ('staff_visit', 'family_portal_view'));
-- commit;
-- <<< vuelta atrás
