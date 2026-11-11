# Entrenadoras titulares por clase y sustitución por sesión (O1)

Fecha: 11 de noviembre de 2026. Origen: oportunidad O1 de `docs/research/competencia/matriz-competitiva.md` («asignar entrenadoras a clases y sustituir por sesión», para igualar a ScoreGym y RG Manager). Es la primera de una cola: invitaciones de entrenadoras (O3), importación desde Excel (O4) y avisos de choque de entrenadora y pista (O2), que se apoyarán en esto.

Objetivo: que la dirección diga quién da cada clase de forma habitual, que cada sesión sepa quién entrena ese día y que un cambio puntual no toque la clase.

## Qué hay

- **Titulares de una clase.** En Clases, cada clase muestra «Titulares: …» y el botón «Asignar titulares» o «Cambiar titulares». Se eligen de 0 a 6 personas entre las que tienen ficha de equipo activa vinculada a un acceso activo con rol Entrenador/a y acceso a la sede de la clase.
- **Herencia.** Cuando se generan sesiones (al crear la clase o al ampliar el calendario), las nuevas sesiones copian las titulares en `zaltyko.session_staff`. Al cambiar las titulares, también pasan a ellas las sesiones **futuras y programadas** que no estén en sustitución. Las pasadas, las canceladas y las sustituidas no cambian.
- **Sustitución en una sesión.** En Pasar lista, la sesión seleccionada muestra «Quién entrena». La dirección puede «Cambiar en esta sesión» (cambiar o añadir personas) con un motivo opcional: Ausencia, Refuerzo, Cambio puntual u Otro motivo. Si la lista final coincide con las titulares, no queda como sustitución. «Quitar la sustitución» devuelve la sesión a las titulares. La clase nunca cambia desde aquí.
- **Qué se ve.** La sesión muestra quién entrena y, si hay sustitución, la marca «Sustitución», quién la hizo, cuándo y las titulares de la clase. El **motivo solo lo ve la dirección** (dirección, administración y coordinación): a una entrenadora el servidor no se lo envía. Hoy (en el club y el Hoy de la entrenadora) muestra «Entrena: …» y la marca de sustitución.
- **Fin de una sustitución.** Una sesión deja de estar en sustitución cuando su lista vuelve a coincidir con las titulares, tanto si se cambia la sesión como si se cambian las titulares de la clase.
- **Hoy de la entrenadora.** Primero «Tus sesiones» (las que tiene asignadas) y después «Resto de la sede». Solo reordena lo que ya veía: no oculta ni añade sesiones, y cualquier entrenadora de la sede sigue pudiendo pasar lista en cualquiera, también como sustituta.
- **Auditoría.** Cada cambio deja una entrada en `zaltyko.audit_log` (`class_template.coaches_set` o `session.coaches_set`) con quién (usuario y miembro), cuándo, la lista anterior, la nueva y el motivo. Solo guarda identificadores, no nombres. La clase guarda además quién asignó cada titular, y la marca de sustitución, quién y cuándo.

## Quién puede hacer qué

| Rol | Titulares de una clase | Quién entrena en una sesión | Cambiar una sesión |
|---|---|---|---|
| Dirección (`owner`) y administración (`admin`) | Leer y cambiar en sus sedes | Leer, con la lista de personas asignables | Sí, en sus sedes |
| Coordinación (`manager`) | Leer y cambiar en sus sedes (todas o las seleccionadas) | Leer, con la lista de personas asignables | Sí, en sus sedes |
| Entrenador/a | No (Clases sigue cerrada; la API responde 403) | Leer en las sedes de su alcance; fuera de ellas la sesión no existe (404) | No (403) |
| Familias | Nada | Nada | Nada |

Todo se comprueba en el servidor y dentro de la transacción de cada operación (`src/modules/coach-assignment/application/coach-assignment-service.ts`):

1. Las rutas de gestión resuelven el alcance con `resolveOwnerScope` (superficie de gestión; el entrenador recibe 403). La lectura de una sesión usa el acceso de Pasar lista (`resolveSessionAttendanceAccess`), sin ampliarlo.
2. El servicio vuelve a comprobar rol y sede con `assertOperationalAccess` y, en escrituras, el modo solo lectura del plan.
3. Solo se pueden **añadir** personas con ficha activa, acceso activo, rol Entrenador/a y la sede de la clase o sesión (`INVALID_RELATION`, 422). Quitar siempre se puede.
4. Cada orden lleva la lista que vio la pantalla: si otra persona la cambió, 409 `VERSION_CONFLICT` y la pantalla recarga la lista actual. Repetir una orden con el mismo `clientRequestId` devuelve el estado actual sin escribir; reutilizarlo para otro cambio, también por la otra ruta, es 409.
5. Una clase de una sede fuera del alcance responde 404, igual que una inexistente.

### Concurrencia

Todas las escrituras toman los cerrojos en el mismo orden, sin ciclos: petición (`clientRequestId`), fila de la academia (la toma el control de solo lectura del plan, como el resto de `/owner`), plantilla de clase (el mismo cerrojo que la generación de sesiones) y filas de sesión. Así, una sustitución y un cambio de titulares de la misma clase no se cruzan. Además, el cambio de titulares bloquea primero las sesiones futuras y solo después lee sus marcas de sustitución, en otra sentencia: una sustitución confirmada mientras esperaba no se pisa. Si aun así PostgreSQL aborta por interbloqueo o serialización (40P01, 40001), la API responde 409 reintentable, nunca 500.

La app conecta como `postgres` con `BYPASSRLS`, así que este control es el que aísla. RLS (ENABLE + FORCE) y los REVOKE a `anon` y `authenticated` son defensa en profundidad.

## API

- `GET /api/v1/owner/classes/{classTemplateId}/coaches?organizationId=…[&locationId=…]`: titulares y personas asignables.
- `PUT /api/v1/owner/classes/{classTemplateId}/coaches`: `{ organizationId, locationId?, clientRequestId, staffProfileIds, expectedStaffProfileIds }`. Devuelve también `updatedSessionCount`.
- `GET /api/v1/owner/sessions/{sessionId}/coaches?organizationId=…&locationId=…`: quién entrena, titulares, sustitución y, solo para la dirección, personas asignables.
- `PUT /api/v1/owner/sessions/{sessionId}/coaches`: `{ organizationId, locationId, clientRequestId, staffProfileIds, expectedStaffProfileIds, reason? }`.

## Solo lectura y funcionalidad dormida

- **Plan en solo lectura:** se puede consultar todo y repetir una orden ya guardada, pero asignar o sustituir responde 409 `PLAN_OVER_CAPACITY`, como el resto de `/owner`. La interfaz desactiva los botones y lo explica.
- **Candidato sin aplicar:** las titulares y la marca de sustitución están en `docs/deployment/candidates/20261111180000_coach_assignment_candidate.sql`, que **requiere autorización de Elvis**. Mientras no se aplique:
  - Clases y Pasar lista no muestran titulares ni quién entrena, y Hoy se pinta como antes.
  - Las cuatro rutas responden 503 con el motivo `coach_assignment_storage_unavailable`, nunca 500.
  - La generación de sesiones no cambia y nada escribe en `session_staff`.

## Datos

- `zaltyko.session_staff` (ya aplicada en `supabase/migrations/20261006080702_establish_zaltyko_domain_foundation.sql`): quién entrena en cada sesión, con `assignment_role = 'coach'`. No tenía API ni pantalla; ahora la escriben las titulares heredadas y las sustituciones.
- Candidato `zaltyko.class_template_staff`: titulares de cada clase (academia, clase, ficha de equipo, quién asignó y cuándo).
- Candidato `zaltyko.session_staff_overrides`: una fila por sesión en sustitución, con motivo (código cerrado), quién y cuándo. Se borra al quitar la sustitución y en cascada con la sesión.
- **Borrados.** Ninguna FK nueva bloquea un borrado. Hoy el superadmin borra usuarios de Auth y la cascada borra su `organization_members`. Las asignaciones se borran en cascada con la clase, la sesión o la ficha de equipo; el histórico queda en `audit_log`. Quien asignó o sustituyó pasa a null con `on delete set null (columna)` (PostgreSQL 15+; el proyecto usa 17) y la pantalla muestra «Equipo». La FK de `session_staff` hacia `staff_profiles`, ya aplicada, sigue siendo RESTRICT: no es de este cambio.
- **`session_staff` y la Data API.** `20261006080702` le da `GRANT SELECT` a `authenticated` con una política por academia, así que cualquier miembro podría leer las asignaciones de todas las sedes si `zaltyko` se expone en la Data API. El repositorio no lo declara en `supabase/config.toml`; el proyecto alojado no se consultó (regla del encargo). El candidato hace `REVOKE` del acceso de `anon` y `authenticated` a `session_staff`: nada en la app la lee con la clave de cliente. La detección exige ese REVOKE para activar la función.
- El espejo Drizzle está en `src/modules/coach-assignment/infrastructure/coach-assignment-schema.ts`, fuera de `src/db/schema/` y sin exportar a drizzle-kit, como en las PR 266 y 271.
- No se encontró ninguna forma previa de modelar la titular de una clase: `class_templates` no tiene columnas de personal y ninguna migración ni candidata relaciona clases con fichas de equipo.

## Decide Elvis

1. **Vínculo entre ficha de equipo y acceso. Primera decisión y dependencia explícita de O3 (invitaciones), la siguiente función de la cola.** `session_staff` apunta a fichas de equipo (`staff_profiles`), y el rol y la sede viven en el acceso (`organization_members`). La columna `staff_profiles.member_id` los une, pero ningún flujo la rellena todavía: las fichas de Equipo se crean sin acceso y la invitación crea el acceso sin ficha. Hasta que se vinculen, nadie aparece como asignable. Propuesta: que la aceptación de la invitación (O3) cree o vincule la ficha. Opción conservadora aplicada: no se crean fichas a partir del correo ni del perfil de Auth.
2. **Fichas sin acceso como titulares.** Una entrenadora que no entra en Zaltyko no se puede asignar, porque el encargo pide rol Entrenador/a y acceso a la sede. ¿Se permite asignarla como titular informativa?
3. **Dirección o coordinación que también entrena.** Solo el rol Entrenador/a es asignable. ¿Se admite a quien coordina y también da clase?
4. **Motivo.** Código cerrado sin nota libre, para no guardar datos de salud en un registro que no se edita. ¿Hace falta una nota?
5. **Pasar lista solo para asignadas.** No cambia (P1 #8, opción A): cualquier entrenadora de la sede pasa lista en cualquier sesión. Restringirlo (opción B) es otra tarea.
6. **Sesiones pasadas.** Se pueden corregir para dejar constancia de quién dio la clase; las canceladas, no. ¿Se bloquean las pasadas?
7. **Quien pierde el acceso.** Sigue asignada hasta que alguien la quite. Se puede quitar, pero no volver a añadir. ¿Se retira sola de las sesiones futuras?
8. **Tope.** Seis personas por clase y por sesión.
9. **Al aplicar el candidato:** añadir las dos tablas a la exportación y a las políticas de `data-rights`, y mover el espejo a `src/db/schema/` con `validate:rls`. La regla de aviso `session_without_coach` empezará a tener datos reales.
10. **Motivo visible para la entrenadora.** Hoy solo lo ve la dirección; la entrenadora ve que hay sustitución, quién y cuándo, pero no por qué. ¿Se le muestra?

## Pruebas

- `tests/coach-assignment-domain.test.ts`: validación Zod (incluido `null` en parámetros opcionales), motivos cerrados, comparación de listas, sustitución, orden de Hoy.
- `tests/coach-assignment-contract.test.ts`: candidato, espejo Drizzle y detección iguales; RLS ENABLE/FORCE y REVOKE; fuera de drizzle-kit; `session_staff` aplicada; rutas con su guard.
- `tests/coach-assignment-routes.test.ts`: orden de comprobaciones, 401/403/400/404/409/422/429/503.
- `tests/coach-assignment-boundary.test.ts`: frontera ESLint de `coach-assignment/*`.
- `tests/owner-coach-assignment-ui.test.tsx`: ficha de clase, Pasar lista y Hoy con y sin disponibilidad, solo lectura y vista de entrenadora.
- `tests/owner-coach-route-matrix.test.ts` y `tests/owner-coach-attendance-page.test.tsx`: el entrenador no asigna; la lectura de sesión es la única ruta nueva que admite al entrenador.
- `tests/coach-assignment-conflicts.test.ts`: 40P01, 40001 y 55P03 llegan como 409 reintentable.
- `tests/coach-assignment-pg.test.ts` (job «Postgres integration»): funcionalidad dormida, RLS/REVOKE (también de `session_staff`), elegibilidad, entrenador sin permiso, 404 fuera de sede, propagación, sustitución solo en su sesión, motivo oculto a la entrenadora, herencia al generar, Hoy, aislamiento entre academias, bloqueo en solo lectura, dos carreras deterministas con esperas observadas en `pg_stat_activity`, mismo `clientRequestId` por las dos rutas y borrado de miembro y de ficha sin bloqueos.
