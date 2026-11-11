# Planificación sobre sesiones (P2 #17, segunda parte)

Fecha: 11 de noviembre de 2026. Plan de mejora `auditorias/2026-11-08/plan-mejora-zaltyko.md`, P2 #17: «Especialización: objetivos y observaciones por gimnasta, luego planificación sobre sesiones; biblioteca GAF/GAM después». La primera parte está en `docs/producto/objetivos-y-observaciones.md`; esta cubre la planificación. La biblioteca GAF/GAM queda para después.

Objetivo: que quien da la clase sepa qué toca hoy (foco y bloques), que lo pueda preparar antes y que, al terminar, marque qué se hizo y deje observaciones de las gimnastas. Sin abrir datos entre academias ni entre sedes.

## Qué hay

- **Plan de una sesión.** Uno por sesión, con tres partes:
  - **Foco del día** (opcional, hasta 200 caracteres).
  - **Bloques** (hasta 20, en orden). Cada bloque tiene:
    - tipo, de una lista cerrada: calentamiento, técnica, preparación física, flexibilidad, coreografía, vuelta a la calma u otro;
    - disciplina opcional (GAF, GAM o rítmica) y aparato opcional, siempre de esa disciplina;
    - contenido en texto libre (hasta 300 caracteres);
    - duración aproximada en minutos (1–240).
  - **Nota** (opcional, hasta 1000 caracteres).
  - Además puede vincular **objetivos de gimnastas** (primera parte de P2 #17), pero solo de gimnastas que participan en esa sesión.
- **Aparatos por disciplina:**
  - GAF: salto, paralelas asimétricas, barra de equilibrio y suelo.
  - GAM: suelo, caballo con arcos, anillas, salto, paralelas y barra fija.
  - Rítmica: manos libres, cuerda, aro, pelota, mazas y cinta.
- **Plantilla de la clase.** Opcional, con foco, nota y bloques. Al crear el plan de una sesión se puede pulsar «Crear desde la plantilla de la clase»: el plan **copia** la plantilla y guarda su revisión de origen. Cambiar la plantilla después no toca los planes ya creados, y editar un plan no toca la plantilla.
- **Después de la sesión.** Desde la hora de inicio, quien ve el plan marca cada bloque como hecho o pendiente. Marcar es idempotente: repetir el mismo estado no cambia la hora ni quién lo marcó, y no cambia la revisión del plan, así que no choca con quien lo está editando. La observación rápida de cada gimnasta es la de la primera parte: «Observación» en su fila de Pasar lista. El panel lo recuerda.
- **Dónde se ve.** En Pasar lista (`/owner/attendance`), bajo la cabecera de la sesión elegida, el panel «Plan de la sesión» (`OwnerSessionPlanPanel`, componente aislado). Para el entrenador, Pasar lista es también su «Hoy»: cada sesión de Hoy enlaza a Pasar lista con esa sesión elegida, así que el plan está a un toque desde Hoy. El panel solo aparece si el servidor comprueba que existen las tablas.

## Quién puede hacer qué

| Rol | Plan de la sesión | Marcar bloques | Plantilla de la clase |
|---|---|---|---|
| Dirección (`owner`), administración (`admin`) y coordinación (`manager`) | Ver, crear y editar en sus sedes | Sí, desde que empieza la sesión | Ver, crear y editar en sus sedes |
| Entrenador/a | Ver, crear y editar en las sedes asignadas, como en Pasar lista | Sí, desde que empieza la sesión | Copiarla al crear un plan; no la cambia |
| Familias | Nada | Nada | Nada |

- **Criterio de acceso del plan:** el mismo que Pasar lista. Cuenta la sede asignada, **no** quién está asignado a la sesión (`session_staff`).
- **Objetivos vinculables:** solo los de gimnastas que participan en la sesión, es decir, con inscripción en su clase o en un grupo vinculado a la clase, vigente en la fecha de la sesión. Además, quien edita tiene que ver la sede desde la que se creó el objetivo. Un objetivo de una sede que no ves no aparece en el plan.
- **Sesión cancelada:** su plan es de solo lectura.

Todo se comprueba en el servidor, dentro de la transacción de cada operación. La fachada es `src/modules/session-plans/application/session-plan-service.ts`. Sus módulos internos (`session-plan/*`) están protegidos por la frontera ESLint `session-plan` de `eslint.internal-boundaries.json`. Las comprobaciones son:

1. **Alcance de la petición:** `resolveOwnerScope`, con la superficie `coach_operations` para el plan de la sesión y con la superficie de gestión para la plantilla, de la que el entrenador queda fuera.
2. **Acceso operativo:** `assertOperationalAccess` vuelve a comprobar el miembro, el rol y la sede.
3. **Pertenencia:** la sede es de la academia y está activa, y la sesión o la clase es de esa sede. Otra sede u otra academia responde 404.
4. **Plan de la academia:** en escrituras se comprueba que no esté en solo lectura, después de reconocer un reintento idempotente.

La app conecta como `postgres` con `BYPASSRLS`, así que este control es el que aísla. RLS (ENABLE + FORCE) y los REVOKE a `anon` y `authenticated` son defensa en profundidad. Las claves foráneas compuestas impiden mezclar academias y sedes aunque el servidor fallara.

## API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/v1/owner/sessions/{sessionId}/plan?organizationId&locationId` | Plan de la sesión | Devuelve el plan (o `null`), el estado de la sesión, si hay plantilla, si puede gestionarla y los objetivos vinculables |
| `PUT /api/v1/owner/sessions/{sessionId}/plan` | Plan de la sesión | Crea o actualiza el plan (ver más abajo) |
| `PUT /api/v1/owner/sessions/{sessionId}/plan/blocks/{blockId}` | Plan de la sesión | `{ done: true \| false }`; idempotente |
| `GET /api/v1/owner/classes/{classTemplateId}/plan-template?organizationId&locationId` | Plantilla de la clase | Lee la plantilla de la clase |
| `PUT /api/v1/owner/classes/{classTemplateId}/plan-template` | Plantilla de la clase | Crea o actualiza la plantilla |

Detalles del `PUT` del plan:

- **Crear:** se envía `expectedRevision: null`. El `clientRequestId` hace idempotente el reintento: misma petición, misma respuesta (200, `replayed: true`). Si el plan ya existe y la petición es otra, responde 409.
- **Crear desde la plantilla:** `source: "template"` copia la plantilla y no tiene en cuenta el foco, la nota ni los bloques enviados.
- **Editar:** se envía la revisión actual. Si otra persona cambió el plan antes, responde 409 `VERSION_CONFLICT`.
- **Bloques al editar:** un bloque que se conserva lleva su `id` y mantiene su marca de hecho aunque cambie de posición. Un `id` que no es de ese plan responde 422.

Todas las respuestas llevan `cache-control: private, no-store`, y las mutaciones exigen el mismo origen.

## Solo lectura y funcionalidad dormida

- **Plan en solo lectura:** se puede consultar todo. Crear, editar, marcar un bloque o cambiar la plantilla responde 409 `PLAN_OVER_CAPACITY`. Repetir un alta ya guardada, o marcar un bloque en el estado que ya tiene, devuelve el resultado sin escribir. La interfaz oculta los botones y lo explica.
- **Migración sin aplicar:** las tablas están en el candidato `docs/deployment/candidates/20261111200000_session_plans_candidate.sql`, que **requiere autorización de Elvis** y depende del candidato de objetivos (`20261111120000_athlete_progress_candidate.sql`). Mientras no se apliquen:
  - Pasar lista no muestra el plan; la página decide con `isSessionPlanAvailableForPage`.
  - Las API responden 503 con el motivo `session_plans_unavailable`, sin errores 500 ni escrituras a medias.
  - El cliente solo trata como «no disponible» ese 503 concreto.

## Modelo de datos (candidato)

- **`zaltyko.session_plans`:**
  - academia, sede y sesión, con FK compuesta a `sessions(organization_id, location_id, id)` en NO ACTION, porque ningún flujo borra sesiones;
  - identificador de petición, foco, nota, revisión de la plantilla de origen, revisión del plan y autor de la creación y del último cambio;
  - único por `(organization_id, session_id)`.
- **`zaltyko.session_plan_blocks`:**
  - posición 1–20, única por plan;
  - tipo, disciplina y aparato con CHECK de la lista cerrada y de la pareja disciplina–aparato;
  - contenido, duración, `done_at` y `done_by_member_id`, que van siempre juntos (CHECK).
- **`zaltyko.session_plan_objectives`:** plan y objetivo, con FK compuesta a `athlete_objectives(organization_id, athlete_id, id)`.
- **`zaltyko.class_plan_templates`:**
  - una por clase, con FK compuesta a `class_templates(organization_id, location_id, id)`;
  - foco, nota, bloques en `jsonb` (array de hasta 20 elementos, validado con Zod al escribir y al leer) y revisión.

Cada escritura deja una entrada de auditoría sin texto libre: solo revisiones, número de bloques y de objetivos.

## Decide Elvis

1. **Plantilla solo para la dirección.** He elegido la opción conservadora: owner, admin y manager crean y cambian la plantilla; el entrenador solo la copia. La plantilla afecta a todas las sesiones futuras de la clase. ¿Debe poder cambiarla también el entrenador de la sede?
2. **Criterio de acceso del plan.** Es el de Pasar lista: la sede, no `session_staff`. Cuando se aplique la asignación de entrenadores a sesiones (PR 276), ¿debe restringirse la edición del plan a quien da la sesión?
3. **Objetivos vinculables.** Solo se ofrecen los objetivos *en curso*, aunque un vínculo ya hecho se conserva si el objetivo cambia de estado. Un objetivo creado en otra sede no lo ve quien no tiene esa sede.
4. **Marcar bloques.** Se permite desde la hora de inicio y en cualquier momento posterior, sin límite. Una sesión cancelada no se marca.
5. **«Hoy» de la dirección.** El panel vive en Pasar lista. La dirección llega a él desde «Pasar lista» o desde Hoy, igual que el entrenador. No se añade una vista del plan dentro de la tarjeta de Hoy, para no tocar ese componente mientras la PR 276 lo cambia.
6. **Familias.** No ven nada del plan.

## Pruebas

- `tests/session-plans-domain.test.ts`: listas cerradas, etiquetas, permisos y validación Zod.
- `tests/session-plans-contract.test.ts`: candidato, espejo Drizzle y detección iguales; RLS y REVOKE; fuera de drizzle-kit; rutas con su guard; el plan no usa `session_staff`.
- `tests/session-plans-routes.test.ts`: orden de las comprobaciones, superficies, códigos y 503 con su motivo.
- `tests/owner-session-plan-ui.test.tsx`:
  - Pasar lista con y sin disponibilidad;
  - el panel en todos sus estados: no disponible, error, sin plan, crear (en blanco o desde la plantilla), editar, marcar bloques, solo lectura, sesión cancelada y guardar como plantilla.
- `tests/owner-coach-attendance-page.test.tsx`: la página pasa la disponibilidad a Pasar lista.
- `tests/owner-coach-route-matrix.test.ts`: las rutas del plan admiten al entrenador; las de plantilla lo deniegan.
- `tests/internal-module-boundaries.test.ts`: frontera `session-plan`.
- `tests/session-plans-pg.test.ts` (job «Postgres integration», PostgreSQL desechable):
  - funcionalidad dormida y dependencia del candidato de objetivos;
  - RLS, REVOKE y rechazo a reinstalar;
  - aislamiento entre academias y sedes;
  - entrenador sin asignación a la sesión;
  - vínculos solo con objetivos de gimnastas de la sesión;
  - alta idempotente y revisiones;
  - marca de bloque idempotente que sobrevive a una edición;
  - la copia de la plantilla no afecta a otras sesiones;
  - bloqueo en solo lectura.
