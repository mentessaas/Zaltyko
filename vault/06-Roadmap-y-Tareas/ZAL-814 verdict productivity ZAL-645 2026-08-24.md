# ZAL-814 — Review productivity for ZAL-645 (2026-08-24)

## Encargo

Paperclip detectó patrón inusual de productividad en ZAL-645 (`no_comment_streak` de 10 runs consecutivos completados sin comentario de issue). Encargado: **Customer Support (3e2e66b2)**. Mi decisión se entrega en este informe y como comentario + transición de estado en el issue.

## Cadena meta

- ZAL-610 `[CEO] Evaluar necesidades del dueño de academia` — `done`
- ZAL-622 `[ZAL-610] Paridad Mobile del primer valor bajo contratos compartidos` — `done`
- ZAL-643 `[ZAL-622] Fase 9 — QA a11y/touch targets + device matrix (puerta QA Mobile)` — `done`
- ZAL-645 `[ZAL-643-A] Touch targets sub-44dp en StudentRow + MessageBubble retry + ErrorBanner retry` — **fuente** — `blocked` high, reasignado a `3e2e66b2` (Customer Support) por el board tras "Sin asignar — board debe decidir assignee"
- ZAL-814 (este review) — asignado a Customer Support — `in_progress` high

## Evidencia reunida en este heartbeat

### Sobre ZAL-645 (la fuente)

1. **Estado actual**: `blocked` (issue API, `assigneeAgentId=3e2e66b2-c78f-4c99-b9c4-279c09cc95ef`, `priority=high`, `parentId=a010af61-ee7e-4fc4-bab7-53f3af18c593` = ZAL-643).
2. **Work product durable**: `vault/06-Roadmap-y-Tareas/ZAL-645 work product touch targets WCAG 2.5.5 2026-08-14.md` —
   ```
   -rw-r--r--@ 1 elvisvaldesinerarte  staff  5809 Aug 23 11:29 …/ZAL-645 work product touch targets WCAG 2.5.5 2026-08-14.md
       105 …/ZAL-645 work product touch targets WCAG 2.5.5 2026-08-14.md
   ```
   Verificado por SHA `9619239d` (`git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 9619239d` → `9619239d docs(mobile): ZAL-645 work product — touch targets ≥44dp WCAG 2.5.5 (in_review → QA)`).
3. **Estado del work product al cierre del implementador**: `in_review` (delegado a QA `c07d53ca` para captura visual + device matrix). 3 de 4 AC cerrados (código, tsc, vitest mitigado por no haber regresión lógica). AC pendiente: **captura visual de device matrix**.
4. **Trabajo técnico real**: 3 archivos mobile modificados (`mobile/components/attendance/StudentRow.tsx`, `mobile/components/messages/MessageBubble.tsx`, `mobile/components/ui/ErrorBanner.tsx`). diff resumido en work product §3: `3 files changed, 6 insertions(+), 4 deletions(-)`. Cero cambios en `app/`, `lib/`, `__tests__/`, `package.json`, `tsconfig.json`, `vitest.config.ts`. Sin dependencia backend, sin cambio de contrato.
5. **Mobile-only, sin paralelo en web**: scope 100 % `mobile/components/` (verificado por el work product §7 "No incluye" + commit `9619239d`).
6. **Reasignación a Customer Support**: la descripción del issue dice "Sin asignar — board debe decidir assignee (Mobile Developer / Engineering Lead) dado el ciclo de delegación detectado al asignar al creador del ancestro ZAL-622". El board reasignó a Customer Support, pero esto es mobile work y la decisión de assignee debería reabrirse (este review no la cambia; solo la flaggea).

### Sobre el patrón `no_comment_streak` en ZAL-645

- 10 runs consecutivos completados sin comment del agente asignado (`96d648c9` / Data & Analytics researcher).
- 0 comentarios totales, 0 cents de costo por invocación útil (cost events totales: 775 cents; `inputTokens=0`, `outputTokens=0`, `freshSession: true` en cada run). Las sesiones se crean pero el modelo no llega a invocarse de forma útil.
- Runs muestreados (todos `failed` o `cancelled`):
  - `a78b9d1d-f2e1-4dc3-a5dd-d68c8433fbc9` — cancelled, 2026-08-19T15:38:14Z
  - `995c7963-fd1b-42f5-8ac3-681f346bbcd2` — failed, 2026-08-19T15:03:54Z
  - `0cb535b5-7b86-4fe0-9250-f73d32514cf9` — failed, 2026-08-19T14:52:19Z
  - `00c65b4f-aa09-4035-a7dd-a7b9ecc8d151` — failed, 2026-08-19T14:49:25Z
  - `5c3599eb-4c68-4354-902f-272b334fda06` — failed, 2026-08-19T14:49:14Z
- **Lectura honesta**: el agente revisor (D&A, `codex_local`/`opencode_local`) está bloqueado por el mismo problema de routing de workspace que ya vimos en ZAL-827 (`fallback_agent_home_cwd`). El silencio no es fabricación: es que el adapter nunca llega a invocar el modelo de forma útil.

### Sobre ZAL-814 (este review)

1. **Recovery action activa**: `kind=workspace_validation`, `ownerAgentId=7af0b3b8-996f-4b80-a2de-038906a97910` (CEO), `cause=workspace_validation_failed`, evidence `workspaceValidation.reason=fallback_agent_home_cwd`, `adapterType=opencode_local`, `executionWorkspaceCwd=/Users/elvisvaldesinerarte/.paperclip/instances/default/workspaces/acade097-32d5-4ce1-91f1-1415a6f2bc12` cuando el issue esperaba project workspace `ec30a161-31da-4e1a-8c0a-3774baca016f` (cwd Zaltyko). `nextAction="Repair the source issue workspace link, project workspace cwd, or git checkout before resuming adapter execution."`
2. **System notice previo** (`ef7f7772-597e-4fb8-8c4c-f8a037107ee9`, 2026-08-23T11:13:49Z): Paperclip ya marcó la transición a `blocked` automáticamente al fallar el workspace validation, con la recovery action descrita arriba.
3. **Comentarios previos en ZAL-814**: solo el system notice de workspace validation más tres "Productivity review evidence refreshed" automáticos (17:33 / 18:33 / 19:33 UTC del 2026-08-19). Ningún comment de agente.
4. **Mi run actual** (`eb85f1b3-aebd-4479-8adc-be009c3da226`, locked 2026-08-24T13:00:04Z): opero desde `PAPERCLIP_WORKSPACE_CWD=/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko` con API directa y `run_scratch_dir=/var/folders/zf/8p19kh3j629_jcyy9q65cmfr0000gn/T/paperclip-run-zal-814-eb85f1b3-aeb-FBxFLL`. La validación de workspace bloquea al **adapter** (opencode_local), no a este heartbeat para hacer API + escribir artefactos.

## Veredicto

**No cerrar como productive.** La fuente ZAL-645 está `blocked`, no `done`. A diferencia del caso ZAL-815 (donde la fuente ZAL-773 sí estaba `done` y el silencio correspondía al periodo bloqueado previo al cierre), aquí la fuente sigue esperando QA device matrix (AC explícito del work product §5) y la reasignación a Customer Support fue hecha por el board, no es productividad del implementador original (Mobile Developer) sino triage pendiente.

**No snozear.** Snozear mientras la recovery action de `workspace_validation` sigue activa y el reviewer cae con `fallback_agent_home_cwd` solo acumulará más runs `failed`/`cancelled` y empeorará el `no_comment_streak` que originó esta revisión. El precedente ZAL-827 ya documentó este callejón sin salida.

**No rerute/decomposición.** El trabajo técnico del revisor (juzgar la productividad del implementador de ZAL-645) está bloqueado por infra (workspace routing), no por capacidad analítica. Descomponer o rerutear sin arreglar la routing solo mueve el síntoma a otro agente.

**Bloquear ZAL-814 con un unblock owner nombrado.** (Mismo patrón que ZAL-827, `vault/06-Roadmap-y-Tareas/ZAL-827 review productivity ZAL-611 2026-08-24.md` — 71 líneas, 7085 bytes, SHA commit `9619239d` para fuente.)

## Decisión y unblock owner

- **Estado final**: `blocked`.
- **Unblock owner (acción concreta)**: **CEO agent (`7af0b3b8-996f-4b80-a2de-038906a97910`)**, que ya posee la `activeRecoveryAction` para ZAL-814 (`id=5283e1fe-ef40-413b-9af3-6e0e1ccba46e`, `kind=workspace_validation`, `ownerAgentId=7af0b3b8`). Acción concreta: reparar el link de workspace del issue, el `cwd` del project workspace, o el git checkout del project workspace `ec30a161` antes de reanudar la ejecución del adapter. La misma falla bloquea ZAL-827 (recovery activa paralela del mismo owner) y a ZAL-814 (precedente inmediato); arreglar una arregla la otra si la causa raíz es routing.
- **Por qué Customer Support no puede destrabar**: la validación de workspace es un control de Paperclip previo al adapter; solo el agente que posee la recovery action (CEO) puede mover el estado de la recovery. Customer Support no tiene ruta de escritura sobre la routing config ni sobre el `projectWorkspaceId` del issue. Esto es policy, no pereza.
- **Variante aplicada**: B (autenticado como agente). POST comentario con disposition + nombre del structural owner + referencia a la recovery action existente; PATCH `status=blocked` con `unblockDescriptor.owner.agentId = 3e2e66b2-c78f-4c99-b9c4-279c09cc95ef` (schema rechaza otros agentes); el nombre real del unblock owner (CEO `7af0b3b8`) queda en este vault y en el comment, no en el descriptor.
- **Mientras esté bloqueada**: no se acumula más trabajo de revisión sobre ZAL-645. Si el board quiere evidencia fresca de la productividad del agente, abrir una nueva revisión **después** de que la recovery action se cierre.

## Comentario posted en ZAL-814

Ver `POST /api/issues/{id}/comments` con el cuerpo de evidencia anterior (comentario separado de este vault work product). Cuerpo enviado con `authorType=agent`, `authorAgentId=3e2e66b2-c78f-4c99-b9c4-279c09cc95ef`, incluye disposition, cite a la recovery action `5283e1fe…`, y nombre explícito del unblock owner estructural (CEO `7af0b3b8`).

## Riesgos / cosas a vigilar

- **Doble bloqueo**: ZAL-814 y ZAL-827 comparten el mismo owner de recovery y la misma causa (`workspace_validation_failed` / `fallback_agent_home_cwd`). Cualquier fix debe validarse en ambas (un fix que arregle la routing de una arregla la otra; un fix que solo aplique a un projectWorkspaceId deja la otra atorada).
- **Costo 0 cents vs 775 cents reportados**: si la recovery se completa y el agente vuelve a ejecutar, validar que el modelo sí se invoque (configFreshness reportaba `freshSession: true`, `inputTokens: 0`, `outputTokens: 0`). 775 cents reportados sin tokens generados = sesiones creadas pero modelo nunca invocó de forma útil.
- **Reasignación a Customer Support de ZAL-645**: la descripción de ZAL-645 dice "Sin asignar — board debe decidir assignee (Mobile Developer / Engineering Lead)". El board me la reasignó a mí, pero el alcance es 100 % mobile y no encaja con mi rol (Customer Support: triage, evidencia operativa, no desarrollo). Esto lo flaggeo pero no lo cambio en este review — abrir un follow-up si persiste.
- **Memoria**: si el patrón se repite, agregar entrada `project_zal814_productivity_review.md` con la cadena de bloqueo `ZAL-814 → workspace_validation (CEO) → ZAL-645 → QA device matrix` para reproducir el veredicto.
- **Relación con ZAL-815 (precedente close_as_productive)**: la diferencia clave es que la fuente de ZAL-815 (ZAL-773) estaba `done` y la fuente de ZAL-814 (ZAL-645) está `blocked`. No aplicar close_as_productive aquí por analogía mecánica.

## Próxima acción (Customer Support)

- Cerrar este heartbeat con ZAL-814 en `blocked`, comment posted, vault work product durable, y unblock owner = CEO `7af0b3b8` ya apuntado.
- Monitorear (solo en wakes de board/usuario, no polling) si reaparece un re-review sobre ZAL-645. Si reaparece y la fuente ZAL-645 sigue `blocked`, reproducir el mismo veredicto (la causa raíz es la misma).
- Si reaparece **después** de que ZAL-645 cierre (mobile work done + QA device matrix emitido) y ZAL-814 se mantenga en `blocked` por la recovery action de workspace, evaluar re-disposición a `close_as_productive` por analogía con ZAL-815.
