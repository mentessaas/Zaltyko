# Objetivos y observaciones por gimnasta (P2 #17, primera parte)

Fecha: 11 de noviembre de 2026. Plan de mejora `auditorias/2026-11-08/plan-mejora-zaltyko.md`, P2 #17: «Especialización: objetivos y observaciones por gimnasta, luego planificación sobre sesiones; biblioteca GAF/GAM después». Este documento cubre solo la primera parte.

Objetivo: que el equipo técnico deje constancia, en la ficha de cada gimnasta, de qué está trabajando (objetivos) y de lo que ve en el día a día (observaciones), sin abrir datos entre academias ni entre sedes y sin mostrar nada a las familias todavía.

## Qué hay

- **Objetivo.** Título breve (2–120 caracteres), disciplina opcional (GAF o GAM) y aparato opcional de esa disciplina, fecha objetivo opcional y estado: *en curso*, *conseguido* o *descartado*. Guarda quién lo creó y cuándo, y un historial con cada cambio de estado (quién, cuándo, de qué a qué). No hay biblioteca de elementos: el título es texto libre.
- **Observación.** Texto breve (hasta 1000 caracteres) con fecha, autor y visibilidad: *solo equipo* (por defecto) o *compartible con la familia*. Puede enlazarse a un objetivo de la misma gimnasta y a una sesión (lo hace el acceso rápido de Pasar lista). La sesión debe cumplir tres condiciones:
  - ser de la misma sede;
  - no ser posterior a la fecha de la observación ni, si no la hay, a hoy;
  - tener a la gimnasta como participante en esa fecha, por inscripción en la clase o por pertenencia a un grupo vinculado a la clase.
- **Dónde se ve.** Los accesos solo aparecen si el servidor comprueba que las tablas existen. Sin la migración no se ven, y si alguien llama a la API recibe 503.
  - En `/owner/groups`, cada gimnasta de un grupo tiene el botón «Objetivos y observaciones», que despliega la sección dentro de su ficha.
  - En Pasar lista (`/owner/attendance`, que para el entrenador es también «Hoy»), cada gimnasta de la sesión tiene dos botones:
    - «Observación», para añadir una nota rápida a esa sesión.
    - «Ver objetivos», un desplegable con los objetivos y las 5 últimas observaciones. Desde ahí se puede cambiar el estado de los objetivos propios y editar las observaciones propias. La gimnasta se identifica por su inscripción en la clase de la sesión.
- **Listados.** Se muestran los 100 objetivos y las 50 observaciones más recientes. Si hay más, la sección lo dice.

## Quién puede hacer qué

| Rol | Leer | Crear | Cambiar estado de un objetivo | Editar una observación |
|---|---|---|---|---|
| Dirección (`owner`), administración (`admin`) y coordinación (`manager`) con todas las sedes | Todas las gimnastas de la academia, incluidas las archivadas y las que tienen historial en la sede | Sí, salvo gimnasta archivada | Cualquiera | Cualquiera |
| Coordinación con sedes seleccionadas | Gimnastas vinculadas a sus sedes; solo registros creados en sus sedes | Sí, en sus sedes | Cualquiera de sus sedes | Cualquiera de sus sedes |
| Entrenador/a | Solo gimnastas con inscripción o grupo **abierto** en una sede asignada (mismo criterio que Pasar lista); solo registros de sus sedes; nunca archivadas | Sí, en sus sedes | Solo los que creó | Solo las suyas |
| Familias | Nada | Nada | — | — |

Todo se comprueba en el servidor, dentro de la transacción de cada operación (`src/modules/athlete-progress/application/athlete-progress-service.ts`):

1. `resolveOwnerScope` con la superficie `coach_operations`: miembro activo, rol permitido y sede de su alcance.
2. `assertOperationalAccess`: vuelve a comprobar miembro, rol y sede y, en escrituras, que el plan no esté en solo lectura.
3. La sede pertenece a la academia y está activa. La gimnasta también es de la academia y está vinculada a esa sede.
4. Cada registro guarda la sede desde la que se creó; quien tiene sedes seleccionadas solo ve y toca registros de esas sedes.

La app conecta como `postgres` con `BYPASSRLS`, así que este control es el que aísla. RLS (ENABLE + FORCE) y los REVOKE a `anon` y `authenticated` son defensa en profundidad frente a clientes directos.

## Solo lectura y funcionalidad dormida

- **Plan en solo lectura:** se puede consultar todo, pero crear, cambiar estado o editar responde 409 `PLAN_OVER_CAPACITY`, igual que el resto de `/owner`. Repetir una creación ya guardada (mismo identificador de petición) devuelve el registro sin escribir. La interfaz desactiva los formularios y lo explica.
- **Migración sin aplicar:** las tablas están en el candidato `docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql`, que **requiere autorización de Elvis**. Mientras no se aplique:
  - Las páginas no muestran los accesos.
  - Las API responden 503 con el motivo `athlete_progress_unavailable`, sin errores 500 ni escrituras a medias.
  - La interfaz solo trata como «no disponible» ese 503 concreto; cualquier otro 503 se muestra como error.

## Modelo de datos (candidato)

- `zaltyko.athlete_objectives`: academia, gimnasta, sede de creación, identificador de petición (idempotencia), título, disciplina, aparato, fecha objetivo, estado, autor, último cambio de estado y revisión (concurrencia optimista).
- `zaltyko.athlete_objective_status_history`: una fila al crear (`from_status` nulo, revisión 1) y otra por cambio.
- `zaltyko.athlete_observations`: academia, gimnasta, sede, identificador de petición, texto, visibilidad, fecha, sesión y objetivo opcionales, autor, última edición y revisión.

Todas las restricciones tienen nombre de menos de 63 caracteres, y el espejo Drizzle repite las CHECK y los únicos. Todas las claves foráneas son compuestas con `organization_id`. La de sesiones queda en NO ACTION: ningún flujo borra sesiones, porque se cancelan por estado, y un `set null` compuesto anularía también la academia y la sede. La sesión debe ser de la misma sede que la observación y el objetivo, de la misma gimnasta. La auditoría (`zaltyko.audit_log`) registra altas, cambios de estado y ediciones sin copiar el texto de las observaciones.

## Decide Elvis

1. **Mostrar observaciones a las familias.** El campo `visibility = 'family'` y la regla `isObservationShareableWithFamily` existen, pero `FAMILY_PORTAL_SHOWS_OBSERVATIONS` es `false` y el portal no lee estas tablas (lo comprueba un test). Falta decidir si se muestran, con qué revisión previa y desde cuándo.
2. **Entrenador editando lo de otros.** Opción conservadora aplicada: solo edita sus observaciones y solo cambia el estado de los objetivos que creó. La dirección y la coordinación pueden con todo lo que ven.
3. **Borrar observaciones.** No hay borrado; solo edición. Falta decidir si hace falta retirar notas (por ejemplo, por petición de la familia) y quién puede.
4. **Coordinación con sedes seleccionadas.** El encargo dice «toda la organización» para `manager`; se aplica el mismo alcance por sede que en el resto de `/owner`, que es lo más restrictivo.
5. **Visibilidad entre sedes.** Un registro solo lo ve quien tiene la sede donde se creó (o todas). Si una gimnasta entrena en dos sedes, el entrenador de una no ve las notas de la otra.
6. **Gimnasta archivada.** El entrenador deja de verla; la dirección conserva la lectura del historial, sin escritura.
7. **Exportación de datos.** La exportación canónica de la academia no incluye todavía estas tablas; habrá que añadirlas al aplicar el candidato.
8. **Lectura del entrenador.** Resuelta con «Ver objetivos» en Pasar lista: ve objetivos y las 5 últimas observaciones de cada gimnasta de la sesión, y puede cambiar el estado de lo que creó. No tiene acceso a la ficha completa de Grupos, que sigue siendo de la dirección.
9. **Espejo Drizzle fuera de `src/db/schema/`.** Está en `src/modules/athlete-progress/infrastructure/` para que `validate:rls`, que solo valida el historial aplicado, no lo trate como migración. Al aplicar el candidato hay que moverlo a `src/db/schema/`, sin exportarlo a drizzle-kit, y la migración debe superar `validate:rls`.

## Pruebas

- `tests/athlete-progress-domain.test.ts`: validación Zod (incluido `null` en parámetros opcionales), aparatos por disciplina, permisos y regla de familias.
- `tests/athlete-progress-contract.test.ts`: candidato, espejo Drizzle y detección con las mismas tablas, columnas, tipos, NOT NULL, defaults, CHECK (nombre y expresión), únicos e índices; nombres de menos de 63 caracteres; RLS ENABLE/FORCE y REVOKE en las tres; fuera de drizzle-kit; el portal de familias no las lee.
- `tests/athlete-progress-routes.test.ts`: orden de comprobaciones de las rutas, 401/403/400/429, 503 «no disponible», 201 frente a 200 en repeticiones.
- `tests/owner-athlete-progress-ui.test.tsx`: estados de la sección y del acceso rápido (no disponible, otro 503, solo lectura, archivada, «hay más», foco, formulario cerrado fuera del DOM, lectura por sesión).
- `tests/owner-athlete-progress-entry.test.tsx` y `tests/owner-coach-attendance-page.test.tsx`: los accesos aparecen solo con las tablas disponibles.
- `tests/athlete-progress-pg.test.ts` (job «Postgres integration»): funcionalidad dormida, RLS/REVOKE, aislamiento entre academias, sede desactivada, entrenador sin asignación, gimnasta archivada, historial de estados, idempotencia, concurrencia, sesiones (otra clase, futura, otra sede, participación por grupo), lectura desde Pasar lista, «hay más» y bloqueo en solo lectura.
