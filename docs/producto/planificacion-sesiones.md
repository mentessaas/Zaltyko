# Guion de la sesión y modelo de la clase (P2 #17, segunda parte)

Fecha: 11 de noviembre de 2026. Plan de mejora `auditorias/2026-11-08/plan-mejora-zaltyko.md`, P2 #17: «Especialización: objetivos y observaciones por gimnasta, luego planificación sobre sesiones; biblioteca GAF/GAM después». La primera parte está en `docs/producto/objetivos-y-observaciones.md`; esta cubre la planificación de las sesiones. La biblioteca GAF/GAM queda para después.

**Vocabulario** (`docs/producto/glosario.md`). En la interfaz se habla de **guion de la sesión** y de **modelo de la clase**. «Plan» queda reservado al plan de Zaltyko y «plantilla» está vetada. En código y en la base se llaman `session_plans` y `class_plan_templates`.

Objetivo: que quien da la clase sepa qué toca hoy (foco y bloques), que lo pueda preparar antes y que, al terminar, marque qué se hizo y deje observaciones de las gimnastas. Sin abrir datos entre academias ni entre sedes.

## Qué hay

- **Guion de una sesión.** Uno por sesión, con:
  - **Foco del día** (opcional, hasta 200 caracteres).
  - **Bloques** (hasta 20, en orden). Cada bloque tiene:
    - tipo, de una lista cerrada: calentamiento, técnica, preparación física, flexibilidad, coreografía, vuelta a la calma u otro;
    - disciplina opcional (GAF, GAM o rítmica) y aparato opcional, siempre de esa disciplina;
    - contenido en texto libre (hasta 300 caracteres);
    - duración aproximada en minutos (1–240).
  - **Nota** (opcional, hasta 1000 caracteres).
  - **Objetivos de gimnastas** (primera parte de P2 #17). Ver «Vínculos con objetivos».
- **Aparatos por disciplina:**
  - GAF: salto, paralelas asimétricas, barra de equilibrio y suelo.
  - GAM: suelo, caballo con arcos, anillas, salto, paralelas y barra fija.
  - Rítmica: manos libres, cuerda, aro, pelota, mazas y cinta.
- **Modelo de la clase.** Opcional, con foco, nota y bloques. «Crear desde el modelo de la clase» **copia** el modelo en el guion y guarda su revisión de origen. Cambiar el modelo después no toca los guiones ya creados, y editar un guion no toca el modelo.
- **Después de la sesión.**
  - Desde la hora de inicio, cada bloque se marca como hecho o pendiente.
  - Marcar es idempotente: repetir el mismo estado no cambia la hora ni quién lo marcó.
  - Marcar no cambia la revisión del guion, así que no obliga a recargar a quien lo está editando.
  - La observación rápida de cada gimnasta es la de la primera parte: «Observación» en su fila de Pasar lista. El panel lo recuerda.
- **Dónde se ve.** En Pasar lista (`/owner/attendance`), bajo la cabecera de la sesión elegida, está el panel «Guion de la sesión» (`OwnerSessionPlanPanel`, componente aislado).
  - Para el entrenador, Pasar lista es también su «Hoy», y cada sesión de Hoy enlaza a Pasar lista con esa sesión elegida.
  - El panel solo aparece si el servidor comprueba que existen las tablas.

## Quién puede hacer qué

| Rol | Guion de la sesión | Marcar bloques | Modelo de la clase |
|---|---|---|---|
| Dirección (`owner`), administración (`admin`) y coordinación (`manager`) | Ver, crear y editar en sus sedes | Sí, desde que empieza la sesión | Ver, crear y editar en sus sedes |
| Entrenador/a | Ver, crear y editar en las sedes asignadas, como en Pasar lista | Sí, desde que empieza la sesión | Copiarlo al crear un guion; no lo cambia |
| Familias | Nada | Nada | Nada |

- **Criterio de acceso:** el del guion es el de Pasar lista. Cuenta la sede asignada, **no** quién está asignado a la sesión (`session_staff`).
- **Sesión cancelada:** su guion es de solo lectura.

Todo se comprueba en el servidor, dentro de la transacción de cada operación. La fachada es `src/modules/session-plans/application/session-plan-service.ts`. Sus módulos internos (`session-plan/*`) están protegidos por la frontera ESLint `session-plan`. Los objetivos se leen a través de la fachada de `athlete-progress`. Las comprobaciones son:

1. `resolveOwnerScope`: superficie `coach_operations` para el guion y de gestión para el modelo, de la que el entrenador queda fuera.
2. `assertOperationalAccess`: vuelve a comprobar miembro, rol y sede.
3. La sede es de la academia y está activa, y la sesión o la clase es de esa sede. Otra sede u otra academia responde 404.
4. En escrituras, el plan de la academia no puede estar en solo lectura. Se comprueba después de reconocer un reintento idempotente.

La app conecta como `postgres` con `BYPASSRLS`, así que este control es el que aísla. RLS (ENABLE + FORCE) y los REVOKE a `anon` y `authenticated` son defensa en profundidad. Las claves foráneas compuestas impiden mezclar academias y sedes aunque el servidor fallara.

## Vínculos con objetivos

- **Nuevos:** solo se admiten objetivos **en curso** de gimnastas que participan en la sesión, es decir, con inscripción en su clase o en un grupo vinculado a la clase, vigente en la fecha de la sesión. El objetivo tiene que ser de una sede que quien guarda ve. Si no se cumple, responde 422 con el mismo mensaje en todos los casos, para no revelar el motivo.
- **Ya hechos:** se conservan al guardar aunque la gimnasta ya no participe o el objetivo haya cambiado de estado. Solo se validan los nuevos.
- **De sedes que quien guarda no ve:** no se muestran y el servidor los **conserva** siempre. Nadie puede quitar un vínculo que no ve.

## Concurrencia e idempotencia

- **Un solo cerrojo por sesión.** Guardar el guion y marcar un bloque toman el mismo cerrojo (`lockCommand`), así que una marca confirmada nunca se pierde por una edición simultánea ni da un 404 falso.
- **Bloques en su sitio.** Editar actualiza cada bloque conservado por su id; solo se borran los quitados y se insertan los nuevos. La unicidad de posición es `DEFERRABLE INITIALLY DEFERRED`, y la marca de hecho sigue al bloque aunque cambie de posición.
- **Alta:** se envía `expectedRevision: null`. El mismo `clientRequestId` con el mismo contenido responde como reintento (200, `replayed: true`).
  - Con otro contenido: 409 `IDEMPOTENCY_CONFLICT`.
  - Si la sesión ya tiene guion y la petición es otra: 409.
  - Reutilizar el `clientRequestId` en otra sesión: 409 `IDEMPOTENCY_CONFLICT`, también si llegan a la vez, porque la restricción única se traduce a 409 y nunca a 500.
- **Edición:** se envía la revisión actual.
  - Si otra persona cambió el guion antes: 409 `VERSION_CONFLICT`.
  - Repetir una edición ya guardada (mismo `clientRequestId`, revisión anterior y mismo contenido) responde como reintento. La última petición se guarda en `last_request_id`.
- **Conflictos de PostgreSQL** reintentables (40P01, 40001 y 55P03): 409 `CONCURRENCY_RETRY` con el helper compartido `src/modules/shared/infrastructure/retryable-db-conflict.ts` (O1). Una unicidad que no sea la de sesión ni la de petición, como la posición diferida al confirmar, también es 409 `CONCURRENCY_RETRY`.

## API

| Método y ruta | Superficie | Qué hace |
|---|---|---|
| `GET /api/v1/owner/sessions/{sessionId}/plan?organizationId&locationId` | Operativa | Guion (o `null`), estado de la sesión, si hay modelo, si puede gestionarlo y objetivos vinculables |
| `PUT /api/v1/owner/sessions/{sessionId}/plan` | Operativa | Crea o edita el guion; `source: "template"` lo crea copiando el modelo |
| `PUT /api/v1/owner/sessions/{sessionId}/plan/blocks/{blockId}` | Operativa | `{ done: true \| false }`; idempotente |
| `GET /api/v1/owner/classes/{classTemplateId}/plan-template?organizationId&locationId` | Gestión | Lee el modelo de la clase |
| `PUT /api/v1/owner/classes/{classTemplateId}/plan-template` | Gestión | Crea o edita el modelo de la clase |

Todas las respuestas llevan `cache-control: private, no-store`, y las mutaciones exigen el mismo origen.

## Solo lectura y funcionalidad dormida

- **Plan de Zaltyko en solo lectura:**
  - se puede consultar todo;
  - crear, editar, marcar un bloque o cambiar el modelo responde 409 `PLAN_OVER_CAPACITY`;
  - repetir un alta ya guardada, o marcar un bloque en el estado que ya tiene, devuelve el resultado sin escribir;
  - la interfaz oculta los botones y lo explica.
- **Migración sin aplicar:** las tablas están en el candidato `docs/deployment/candidates/20261111200000_session_plans_candidate.sql`, que **requiere autorización de Elvis** y depende del candidato de objetivos (`20261111120000_athlete_progress_candidate.sql`). Mientras no se apliquen:
  - Pasar lista no muestra el panel; la página decide con `isSessionPlanAvailableForPage`;
  - la API responde 503 con el motivo `session_plans_unavailable`, nunca 500;
  - el cliente solo trata como «no disponible» ese 503 concreto.

## Modelo de datos (candidato)

- **`zaltyko.session_plans`:**
  - academia, sede y sesión, con FK compuesta a `sessions(organization_id, location_id, id)` en NO ACTION, porque ningún flujo borra sesiones;
  - `client_request_id` (alta) y `last_request_id` (última escritura), foco, nota, revisión del modelo de origen, revisión, autor y último cambio;
  - único por `(organization_id, session_id)`.
- **`zaltyko.session_plan_blocks`:**
  - posición 1–20, única por guion y diferida;
  - tipo, disciplina y aparato con CHECK de la lista cerrada y de la pareja disciplina–aparato;
  - contenido, duración, y `done_at` con `done_by_member_id`, que van siempre juntos.
- **`zaltyko.session_plan_objectives`:** guion y objetivo, con FK compuesta a `athlete_objectives(organization_id, athlete_id, id)`.
- **`zaltyko.class_plan_templates`:**
  - uno por clase, con FK compuesta a `class_templates(organization_id, location_id, id)`;
  - foco, nota, bloques en `jsonb` (array de hasta 20, validado con Zod al escribir y al leer) y revisión.

Cada escritura deja una entrada de auditoría sin texto libre: solo revisiones y recuentos.

## Decide Elvis

1. **Modelo de la clase solo para la dirección.** He elegido la opción conservadora: owner, admin y manager lo crean y cambian; el entrenador solo lo copia. El modelo afecta a todas las sesiones futuras de la clase. ¿Debe poder cambiarlo también el entrenador de la sede?
2. **Criterio de acceso del guion.** Es el de Pasar lista: la sede, no `session_staff`. Con O1 (PR 276) ya se sabe quién entrena cada sesión (titulares y sustituciones), pero el guion no lo usa todavía. ¿Debe restringirse la edición a quien da la sesión, dejando la lectura a toda la sede?
3. **Vínculos con objetivos.** Solo se crean con objetivos *en curso*. Los vínculos ya hechos se conservan aunque cambien el objetivo o la participación, y los de sedes que no ves no se pueden quitar.
4. **Marcar bloques.** Se permite desde la hora de inicio, sin límite posterior. Una sesión cancelada no se marca.
5. **Hoy.** No hay vista del guion dentro de la tarjeta de Hoy: Hoy enlaza a Pasar lista, donde está el guion, junto a «Quién entrena» de O1. Añadirlo en la tarjeta es un paso posterior.
6. **Familias.** No ven nada del guion.

## Pruebas

- `tests/session-plans-domain.test.ts`: listas cerradas, etiquetas, permisos y validación Zod.
- `tests/session-plans-contract.test.ts`: candidato, espejo Drizzle y detección iguales; RLS y REVOKE; unicidad diferida; fuera de drizzle-kit; rutas con su guard; sin `session_staff`; objetivos leídos por la fachada.
- `tests/session-plans-routes.test.ts`: orden de las comprobaciones, superficies, 503 con su motivo y 409 para los conflictos de PostgreSQL.
- `tests/owner-session-plan-ui.test.tsx`: Pasar lista con y sin disponibilidad, y el panel en todos sus estados.
- `tests/owner-coach-attendance-page.test.tsx`, `tests/owner-coach-route-matrix.test.ts` y `tests/internal-module-boundaries.test.ts`.
- `tests/session-plans-pg.test.ts` (PostgreSQL desechable):
  - funcionalidad dormida y dependencia del candidato de objetivos;
  - RLS y rechazo a reinstalar;
  - aislamiento entre academias y sedes;
  - entrenador sin asignación a la sesión;
  - reglas de vínculos (nuevos, ya hechos e invisibles);
  - idempotencia y revisiones, incluido `clientRequestId` reutilizado en otra sesión;
  - marca idempotente que sobrevive a una edición;
  - **carrera determinista entre marcar y editar** con `pg_blocking_pids`;
  - copia del modelo sin efecto en otras sesiones;
  - bloqueo en solo lectura.
