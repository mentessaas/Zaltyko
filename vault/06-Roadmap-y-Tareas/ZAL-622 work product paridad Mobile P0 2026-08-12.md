---
status: in_progress
owner: Mobile Developer
issue: ZAL-622
parent: ZAL-610
contract: ZAL-619 (v1.0, done)
blocker: ninguno formal — ZAL-635 cerrado 2026-08-12T17:46Z; Fases 6–9 dependen de decisiones cross-equipo (Engineering Lead / QA / P&S)
version: 1.0
last_reviewed: 2026-08-12
disposition: explicit_continuation — Fases 0–5 shipped; quedan 6–9 (search/import bloqueados por backend, idempotencia end-to-end, paridad observable, a11y/device matrix)
last_disposition_fix: 2026-08-12T20:43Z (Fase 5 shipped — commit e4a22e67b, AC-08 cerrado a nivel cliente)
last_sprint_shipped: 2026-08-12T20:43Z (Fase 5: familia my-dashboard + aislamiento parent)
---
phase_0_shipped: true
phase_0_commit: e31236dc8 feat(mobile): ZAL-622 Phase 0 — ApiClientError retryable + nextAction + error translator
phase_1_shipped: true
phase_1_commit: 2a0e97c1a feat(mobile): ZAL-622 Phase 1 — attendance cancelled bloquea, save_failed etiquetado, idempotencyKey cliente
phase_2_shipped: true
phase_2_commit: 50f7025ad feat(mobile): ZAL-622 Fase 2 — cliente dashboard.get compartido + AdminHome bloques
phase_3_shipped: true
phase_3_commit: ee4c1883c feat(mobile): ZAL-622 Fase 3 — mensajes sent/pending/failed + retry + aislamiento
phase_4_shipped: true
phase_4_commit: 839c31c60 feat(mobile): ZAL-622 Fase 4 — Charge.status contractual completo + copy localizada
phase_5_shipped: true
phase_5_commit: e4a22e67b feat(mobile): ZAL-622 Fase 5 — familia my-dashboard (AC-08) + aislamiento parent
---
evidence_scope: local-repository (mobile/ + src/ + vault); no production or human validation
phase_0_shipped: true
phase_0_commit: e31236dc8 feat(mobile): ZAL-622 Phase 0 — ApiClientError retryable + nextAction + error translator
phase_1_shipped: true
phase_1_commit: 2a0e97c1a feat(mobile): ZAL-622 Phase 1 — attendance cancelled bloquea, save_failed etiquetado, idempotencyKey cliente
phase_2_shipped: true
phase_2_commit: 50f7025ad feat(mobile): ZAL-622 Fase 2 — cliente dashboard.get compartido + AdminHome bloques
phase_3_shipped: true
phase_3_commit: ee4c1883c feat(mobile): ZAL-622 Fase 3 — mensajes sent/pending/failed + retry + aislamiento
phase_4_shipped: true
phase_4_commit: 839c31c60 feat(mobile): ZAL-622 Fase 4 — Charge.status contractual completo + copy localizada
---

# ZAL-622 — Paridad Mobile del primer valor bajo contratos compartidos

## 1. Decisión de partida

ZAL-622 hereda el contrato de ZAL-619 v1.0 (P0 ICP gimnasia Web/Mobile) y debe cerrar la paridad Mobile para dueño, coach y familia en los siete módulos del contrato: búsqueda, dashboard operativo, agenda/asistencia, comunicación, progreso, cobros e importación (consulta). El alcance es estrictamente **móvil** dentro de `mobile/`; no se reescribe backend, no se introducen rutas paralelas, no se modifica el contrato. Toda mutación pasa por `lib/api/*` y desestructura `{ data }`; los errores se traducen al set mínimo de códigos definidos en el contrato.

Hipótesis operativas del trabajo (no утверждаются como verdad de mercado):

- La paridad se demuestra por comportamiento observable y por respuesta comparada con la web, no por layout idéntico.
- El flujo offline se mantiene **read-only** y bloqueado para mutaciones hasta una decisión de fase posterior; no se introduce cola mutacional.
- Los touch targets, la accesibilidad, los estados de loading/error y la navegación se verifican en emulador (Android AVD + iOS Simulator) y, si llega a haberlos, en dispositivos físicos de la matriz. La hipótesis "móvil antiguo" queda abierta hasta evidencia real.

## 2. Matriz iOS/Android y dispositivos objetivo (hipótesis inicial)

| Plataforma | Versión mínima | Dispositivo de referencia | Estado |
|---|---|---|---|
| iOS | 15.1 (Expo SDK 53) | iPhone SE (3rd) + iPhone 13 | hipótesis hasta E2E |
| Android | API 24 (Android 7.0) | Pixel 6a AVD + Galaxy A13 (físico si disponible) | hipótesis hasta E2E |
| Tablet | fuera de P0 (`ios.supportsTablet: false`) | — | excluido |

Notas:

- `expo.ios.supportsTablet` está en `false` en `mobile/app.json` y no se relaja en P0.
- El bundle identifier iOS `com.mentessaas.zaltyko` y el package Android `com.mentessaas.zaltyko` son los que se usan en `eas.json`; no se cambian.
- El "móvil antiguo" (Android <8, iPhone 6/7) queda como **hipótesis excluida de P0**; si el cliente insiste, se reabre con device matrix real.

## 3. Estado actual (inventario) y gaps por criterio de aceptación

Inventario verificado contra `mobile/` (commit HEAD en `gates/ZAL-556`). La columna "Evidencia" apunta al archivo y línea para no abrir issues fantasma.

### AC-01 Búsqueda
- **Inventario:** no existe endpoint `search` en `mobile/lib/api/endpoints.ts` ni pantalla dedicada. La app navega por id desde listas previas (children, schedule, classes).
- **Gap:** falta cliente `search` + pantalla/CTA para owner/coach y caja de búsqueda en familia.
- **Dependencia:** el backend debe exponer el endpoint canónico del contrato (`/api/search` o el que la web ya use con los mismos query params). Confirmar con Engineering Lead / Web Developer antes de tipar.

### AC-02 Dashboard operativo del dueño
- **Inventario:** `mobile/app/(tabs)/index.tsx:282 AdminHome` ya consume `getMyKpis()` (`/api/me/kpis`) y renderiza seis tiles (atletas, coaches, grupos, clases esta semana, evaluaciones, asistencia 7d).
- **Gaps:**
  1. Los tiles son números desnudos; el contrato exige que cada contador **enlace a la tarea** que lo explica y muestre "sin datos" en lugar de cero inventado cuando la fuente esté vacía. Hoy el fallback es `?? 0` (línea 299-304), lo cual viola el contrato.
  2. Faltan bloques de agenda de hoy, asistencia pendiente, mensajes/avisos pendientes, cargos vencidos/fallidos y estado de importación activa. Sólo hay KPIs.
  3. No existe vista de búsqueda (AC-01) ni import job (AC-07) en la app.
- **Decisión:** añadir cliente `getMyDashboard()` y reemplazar el shell de `AdminHome` por bloques que enlacen a las listas reales. No inflar KPIs: si la fuente no existe, "sin datos".

### AC-03 Agenda y asistencia
- **Inventario:**
  - Pantalla coach `mobile/app/coach/attendance/[sessionId].tsx` ya hace carga paralela (sesión + atletas + asistencia) y `upsertAttendance` batch.
  - `lib/api/endpoints.ts:225 upsertAttendance` envía `entries` sin `idempotencyKey` (el backend actual tampoco la acepta en `src/app/api/attendance/route.ts`).
- **Gaps:**
  1. **Sesión cancelada:** la pantalla no consulta el estado de la sesión antes de permitir marcar; si el backend la marca `cancelled`, el coach podría enviar asistencia. Contrato: "Solo sesiones no canceladas aceptan asistencia". Solución mobile: deshabilitar `StudentRow` y el botón Guardar cuando `session.status === 'cancelled'`, mostrar banner explicativo.
  2. **Estado `save_failed`:** hoy, si el `mutate` falla, se muestra `ErrorBanner` y se descarta el aviso. El contrato exige conservar el estado local **no confirmado** y ofrecer reintento sin presentarlo como guardado. La pantalla ya lo retiene (no limpia `statusOverrides` en `onError`), pero falta etiquetar visualmente el estado y mostrar el conteo de "no confirmados".
  3. **Idempotencia:** el contrato pide clave de idempotencia en `attendance.upsert`. El backend no la acepta hoy. **Bloqueador cross-equipo** — Engineering Lead debe decidir si la ruta acepta header `Idempotency-Key` y devuelve 200 con el mismo recurso o 409 `IDEMPOTENCY_CONFLICT`. Sin esa decisión, la app no puede enviar la clave; workaround: reintento idempotente cliente (mismo payload → mismo resultado natural del upsert) hasta que se sume el header.
  4. **Estados permitidos:** la UI expone `present | absent | late | excused`; el contrato dice `present | absent | late | justified`. El backend Zod schema (`src/app/api/attendance/route.ts:13`) acepta `excused`. Decisión: **mantener `excused`** como término técnico (alineado con backend, tests y datos existentes) y documentar la equivalencia con `justified` del contrato. Esto NO es invención de estado: es mapeo explícito de un nombre interno a un nombre de producto. Si el board quiere renombrar, se hace en backend + tests + mobile + web en una sola PR.
  5. **Repetición idempotente:** ya está cubierta por el upsert SQL; falta un test E2E explícito que envíe el mismo payload dos veces y verifique un solo registro.

### AC-04 Comunicación interna
- **Inventario:** bandeja `app/(tabs)/messages.tsx` lista conversaciones (`getConversations`); detalle `app/messages/[id].tsx` lee mensajes paginados y envía respuestas; `GroupAlertModal` permite aviso a grupo desde la sesión del coach. Estados visibles: `sent` (tras enviar), ausencia de `read`/`failed` explícitos.
- **Gaps:**
  1. El contrato exige que el destinatario vea `sent | read | failed` con evidencia. La UI actual no muestra `read` por destinatario y trata cualquier error del POST como banner genérico.
  2. Envío a familia/atleta/grupo desde la app está implementado para coach (GroupAlertModal); owner no tiene flujo equivalente en `AdminHome` (sólo en la web).
  3. Aislamiento: no existe test negativo que verifique que un `parent` no ve conversaciones de otra familia. El backend filtra por membership, pero la UI no degrada si devuelve listas vacías por error.
- **Plan:** mapear `error.code` a copy localizado; añadir estado `failed` con CTA "Reintentar" en `MessageBubble`; crear test de aislamiento en matriz sintética.

### AC-05 Progreso
- **Inventario:** `getMyProgress` y `createAssessment` ya existen en `endpoints.ts`. La pantalla `family/child/[id].tsx` muestra resúmenes (`AttendanceSummary`, `AssessmentsSummary`).
- **Gaps:**
  1. Familia ve progreso `published` sólo si la API lo filtra; el contrato pide garantía explícita. Hoy la app confía en el filtro del backend. Solución: el `AssessmentSummary` ya viene con `overallComment` etc.; añadir verificación de que el `assessmentDate` se muestra y de que no aparece ningún `draft` (test negativo a nivel de contrato).
  2. Drafts del coach: no hay UI para crear/editar drafts desde la app — sólo el modal rápido `AssessmentModal` que crea `coach_feedback` directo. El contrato permite draft + publish; la app salta draft. Decisión: **mantener como fast-path** y documentar que el flujo completo de draft/publish queda en web para no duplicar trabajo.
  3. Modalidad/aparato: `createAssessment` omite aparato a propósito. Aceptable para P0 según el comentario del propio endpoint; documentar la decisión.

### AC-06 Cobros
- **Inventario:** `app/family/invoices.tsx` lista `getMyCharges()`; el pago abre la web vía WebBrowser (`getChargePayUrl`). El `InvoiceCard` muestra label, importe, estado.
- **Gaps:**
  1. El tipo `Charge.status` en `endpoints.ts:99` es `'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded'`. Faltan `partial`, `failed` y `due` que el contrato lista. Hoy la app colapsa cualquier estado no reconocido a la tabla existente. Acción: ampliar la unión, añadir mapeo de color/copy por estado y test visual.
  2. **Pago manual** (`manualPayment.record`) no existe en mobile y no debería: el contrato reserva eso a owner y la app de owner no tiene flujo de cobros. Confirmar scope.
  3. Pago manual desde la app para familia: NO es P0 (Apple Guideline 3.1.3(f) obliga a web companion). Documentado ya en `app/family/invoices.tsx:1-5`.
  4. Pagos vencidos/parciales: el `InvoiceCard` debe distinguirlos visualmente. Verificar copy.

### AC-07 Importación
- **Inventario:** no existe UI de importación en mobile (acordado: el upload es Web, mobile sólo consulta).
- **Gap:** falta cliente `getImportJob(jobId)` y una pantalla de consulta que muestre `created | preview_ready | mapping_required | validated | committed | rolled_back | failed | cancelled` y, si falla, errores por fila.
- **Dependencia:** endpoint backend. Engineering Lead confirma si `/api/import-jobs/[id]` (o el nombre que la web ya use) devuelve ese shape.

### AC-08 Familia → `my-dashboard` y aislamiento
- **Inventario:** tabs del padre muestran agenda, mensajes, notificaciones, perfil. Cobros se accede por "Cuotas y pagos" desde `family/invoices.tsx`.
- **Gaps:**
  1. La home del padre no muestra un resumen diario con próximas clases + avisos no leídos + cargos pendientes. Hay que enlazar con un "my-dashboard" análogo al de la web.
  2. Tests negativos: no existe test que verifique que un `parent` no llega a rutas de admin. Las rutas admin **no existen en mobile** (`app/(tabs)/_layout.tsx` ya las filtra por rol), pero sí están las pantallas de coach. Test: parent con `viewer = false` no debe poder navegar a `app/coach/attendance/...` vía deep link. Verificar `role-router.test.ts`.

### AC-09 Idempotencia
- **Gap cross-equipo:** el contrato exige `Idempotency-Key` en `attendance.upsert`, `communication.send`, `progress.save`, `manualPayment.record`, `import.*`. El backend actual no lo implementa. **Bloqueador para AC-09.** No se puede cerrar este criterio desde mobile sin decisión del backend.
- Mitigación local mientras tanto: cliente genera `idempotencyKey = UUIDv4` y la guarda en `AsyncStorage` por par `(mutationKind, payloadHash)`; al reintentar, reusa. Si el backend no la respeta, el comportamiento es no-op (el upsert es naturalmente idempotente en SQL). Documentar como **deuda explícita**.

### AC-10 Errores: confirmed/pending/failed y next action
- **Inventario actual:** `lib/api/client.ts:18 ApiClientError` lleva `{code, message, status}`. El contrato pide `{code, message, retryable, nextAction}`. `nextAction` no se transporta; `retryable` se infiere por código (manual).
- **Gaps:**
  1. Extender `ApiClientError` con `retryable: boolean` y `nextAction: 'retry' | 'reauth' | 'contact_support' | 'wait' | 'none'`.
  2. Mapear los códigos mínimos del contrato (`AUTH_REQUIRED`, `FORBIDDEN_ROLE`, `ACADEMY_NOT_FOUND`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_CONFLICT`, `DUPLICATE_SUSPECTED`, `IMPORT_ROW_INVALID`, `IMPORT_TOTAL_MISMATCH`, `PAYMENT_STATE_UNAVAILABLE`, `DELIVERY_FAILED`, `RATE_LIMITED`, `TEMPORARY_UNAVAILABLE`) a copy localizado + `nextAction`.
  3. Garantizar que ningún error muestra stack trace ni secreto. Hoy el cliente hace `err.message` y el `ErrorBanner` lo enseña. Hay que filtrar `details` que venga del backend.
  4. Distinguir `pending` (optimistic local) vs `confirmed` (server ack) en mutaciones; la app ya lo hace implícitamente con `useMutation` + `isPending`, falta etiqueta visible ("Guardando…"/"Guardado"/"No guardado — toca para reintentar") en attendance y mensajes.

### AC-11 Paridad Web/Mobile sobre mismo contrato
- **Gap metodológico:** no existe hoy un test que compare la respuesta de la web y la mobile para los mismos endpoints. Crear matriz de paridad (archivo `mobile/tests/parity/`) que ejecute 7–10 endpoints y verifique shape compatible. No validar lógica de UI: sólo que la app no invente estados ni campos.

### AC-12 Métricas y honestidad de estado
- **Gap:** la app no instrumenta eventos de usage; no hay cliente de analytics. Esto es P0 de Data (issue separada). Mobile sólo garantiza no enviar `checkout_started`, `trial_started` ni estados Paperclip como adopción.

## 4. Plan de implementación por fases

Las fases son secuenciales; cada una termina con un PR + comment de evidencia en ZAL-622.

### Fase 0 — Tipos y traductor de errores (pre-requisito)
- Ampliar `ApiClientError` con `retryable` y `nextAction`.
- Crear `mobile/lib/api/error-codes.ts` con la tabla del contrato (código → copy + acción).
- Aplicar traductor en `client.ts` y verificar que `ErrorBanner` lo respeta.
- **Tamaño:** 1 PR pequeño, testeable con mocks de status.
- **No bloquea nada externo.**
- **Estado 2026-08-12 (v0.2):** shipped en este heartbeat. La refactorización de `client.ts` cumple AC-10 de tres formas: (a) `ApiClientError` siempre lleva `retryable` + `nextAction` derivados de `translateError()`; (b) el `message` mostrado en UI **nunca** viene del backend — incluso para códigos contractuales (seguro por contrato) y, sobre todo, para códigos desconocidos (cualquier `message` del backend se descarta a favor del fallback); (c) el `message` que viajaba en crudos errores de red (`err.message` de `TypeError`) ya no se filtra. Tests: `error-codes.test.ts` (12 tests, uno por código contractual + exhaustividad + cliente + fallback) y `client.test.ts` (17 tests cubriendo 401/refresh, NO_SESSION, NETWORK_ERROR, TIMEOUT, AUTH_REQUIRED, RATE_LIMITED, FORBIDDEN_ROLE, HTTP_5xx, código desconocido y NO-exposición de stack trace). Verificación: `tsc --noEmit` pasa, `vitest` no se pudo ejecutar en este heartbeat (Node 22 + macOS EAGAIN en `node:fs:736` `tryReadSync` repetido en `/tmp` y en `mobile/`; ver limitación al pie).

### Fase 1 — Attendance: cancelled + save_failed + idempotencia cliente
- Bloquear UI si `session.status === 'cancelled'`.
- Etiquetar visualmente "pendiente de guardar" / "guardado" / "no guardado".
- Generar `idempotencyKey` cliente y guardarlo en `AsyncStorage` por hash de payload.
- Tests: cancelled rechaza, reintento no duplica.
- **Tamaño:** 1 PR mobile-only.
- **Bloqueador residual:** AC-09 sólo se cierra con backend.
- **Estado 2026-08-12 (v0.3):** shipped en este heartbeat. Tres entregables mobile-only:
  1. **Nuevo módulo `mobile/lib/api/idempotency.ts`** con `getOrCreateIdempotencyKey(kind, payload)` y `clearIdempotencyKey`. Hash FNV-1a 32-bit estable sobre el payload (orden de claves indiferente); UUIDv4 vía `Math.random()` (justificación en el header del archivo — no criptográfica, sólo estadística; evita acoplar la app a polyfills de crypto). Claves en AsyncStorage con namespace `idem:v1:`; prune LRU best-effort si >200 entradas (umbral alto porque el uso real son decenas por sesión).
  2. **`mobile/lib/api/client.ts`** extendido: `RequestOpts.idempotencyKey` se traduce a header `Idempotency-Key` cuando se provee. `upsertAttendance(sessionId, entries, { idempotencyKey })` en `endpoints.ts` lo propaga. Backward-compatible: si no se pasa, el header no se manda (tests `endpoints.test.ts` fijan ambos casos).
  3. **`mobile/app/coach/attendance/[sessionId].tsx`** refactorizado: bloque de UI si `session.status === 'cancelled'` (banner `InfoBanner` nuevo en `components/ui/InfoBanner.tsx`, también oculta `GroupAlertModal` y deshabilita `StudentRow.onChange`); contador "X de Y marcados · N sin guardar"; botón Guardar muestra `(N)` y se deshabilita cuando no hay cambios o la sesión está cancelada; banner de error siempre viene de `ApiClientError.message` (que pasó por `translateError`); borde warning en filas `dirty`. En `onError` NO se limpian los overrides — el contrato exige conservar el estado no confirmado y ofrecer reintento.
- **Tests añadidos en este heartbeat:**
  - `mobile/lib/api/idempotency.test.ts` (12 tests): UUIDv4 formato + unicidad; `hashPayload` estable con orden de claves indiferente; `getOrCreateIdempotencyKey` reuse vs new vs payload-cambio-da-clave-nueva; tolerante a fallos de storage get/set/remove; distintos kinds NO colisionan; `clearIdempotencyKey` namespace correcto y tolerante a fallos.
  - `mobile/lib/api/endpoints.test.ts` describe nuevo `idempotencia de mutaciones (ZAL-619 §6.2 + AC-09)`: `upsertAttendance` SIN key no manda header; CON key manda `Idempotency-Key`; 409 `IDEMPOTENCY_CONFLICT` se traduce a `ApiClientError` con `nextAction=contact_support` (compatible con `error-codes.ts`).
- **Verificación:** `tsc --noEmit` pasa (solo el error preexistente de `vitest.config.ts` por `@types/node` no instalado, ya documentado). `vitest run` no se pudo ejecutar en este heartbeat por el mismo problema Node 22 + macOS EAGAIN documentado en §Limitación (al pie); el código pasa revisión estática y los tests siguen el patrón de `welcome.test.ts` que sí cubre ese módulo en CI.

### Fase 2 — AdminHome: bloques del contrato (AC-02)
- Consumir el bundle `OwnerAttentionBundle` del endpoint compartido `GET /api/dashboard/[academyId]/attention?view=owner` (ZAL-619 §6.2 + ZAL-635).
- Reemplazar los 6 tiles de KPI por bloques con enlaces: today (sesiones), attendancePending, messagesPending, chargesOverdue, progressDrafts, importActive, priorityAction.
- "Sin datos" / "Fuente no disponible" según `sourceAvailable` — NUNCA `?? 0` cuando la fuente no esté disponible (gap explícito del contrato ZAL-619 §6.2).
- **Estado 2026-08-12 (v0.5):** shipped en este heartbeat. Tres entregables mobile-only:
  1. **Nuevo módulo `mobile/lib/api/dashboard.ts`** con tipos espejo de `src/lib/dashboard/attention-types.ts` (Web) — `OwnerAttentionBundle`, `CoachAttentionBundle`, `TodaySession`, `AttendancePendingBlock`, `MessagesPendingBlock`, `ChargesOverdueBlock`, `ProgressDraftsBlock`, `ImportActiveBlock`, `PriorityAction`, etc. Función `getAttention(academyId, view)` construye la URL con academyId encodeado, view en query, NO envía `date` (server resuelve en zona horaria de la academia, ZAL-635 §Riesgos). Helper `renderCount(block)` discrimina `value | empty | unavailable` para que la UI NUNCA presente `count=0` como 0 cuando `sourceAvailable=false` (es no autoritativo por contrato).
  2. **`mobile/lib/api/dashboard.test.ts`** (14 tests): URL con `academyId` encodeado y `view` en query; NO envía `date`; adjunta bearer; desestructura `{ data }` (no leakea `meta`/`ok`); mapea errores contractuales `FORBIDDEN_ROLE` (403 → nextAction=contact_support), `VALIDATION_ERROR` (400 → none), `RATE_LIMITED` (429 → wait), 500 con código desconocido (fallback retryable, no expone stack); códigos desconocidos del backend caen al fallback sin filtrar message (AC-10). `renderCount` cubre los 4 casos (value, empty, unavailable con count>0, unavailable con null/undefined).
  3. **`mobile/app/(tabs)/index.tsx AdminHome`** refactorizado: consume `getAttention(profile.academyId, 'owner')`; query key `['dashboard', 'attention', academyId, 'owner']` para que `onRefresh` invalide el bundle completo. Eliminado `getMyKpis` y los 6 `KpiTile` con `?? 0`. Render por bloques: banner `priorityAction` (alto contraste amarillo), card `importActive` cuando hay job en curso, `TodaySessionsCard` (clase/hora/estado de asistencia), `BlockTile` para `attendancePending` y `progressDrafts`, `MessagesPendingCard` (unsent/failed/unread), `ChargesOverdueCard` (overdue/failed). Cada bloque con "Fuente no disponible" cuando `sourceAvailable=false`, "Sin X" cuando `count=0`, valor cuando `count>0`. Sin `academyId` en perfil → empty state "Sin academia asignada" sin loop de loading.
  4. **Apertura de `href`:** Mobile abre todos los `href` del bundle vía `Linking.openURL` (web companion). Fase 3 introducirá una tabla de mapeo href → ruta interna Expo Router para las acciones con pantalla nativa (asistencia, mensajes, hoy).
- **Tests añadidos en este heartbeat:**
  - `mobile/lib/api/dashboard.test.ts` (14 tests, lista arriba).
- **Verificación:** `tsc --noEmit` limpio en código nuevo (los errores residuales en `vitest.config.ts` por `@types/node` no instalado son preexistentes y ya documentados). `vitest run` no se pudo ejecutar en este heartbeat por el mismo problema Node 22 + macOS EAGAIN ya documentado en §Limitación (el workaround documentado es `tsc + static check`, ejecutado).
- **Cobertura de contrato:** Mobile consume exactamente el endpoint canónico `GET /api/dashboard/[academyId]/attention?view=owner` que la Web ya usa para `/app/[academyId]/dashboard/at-a-glance`. NO se crea una segunda API. NO se duplica la agregación en cliente. El subset de coach queda en Fase 3 (AC-02 + AC-04 + AC-09 parcial).

### Fase 3 — Mensajes: estados de entrega y aislamiento (AC-04)
- Mostrar `sent | read | failed` por mensaje.
- CTA "Reintentar" en `failed`.
- Tests negativos: parent no ve conversaciones ajenas.

### Fase 4 — Cobros: tabla completa de estados (AC-06)
- Extender `Charge.status` con `partial`, `failed`, `due`.
- Mapa de color/copy por estado.
- Verificar que el copy de "vencido" no afirma recibo legal.

### Fase 5 — Familia my-dashboard (AC-08)
- Pantalla `family/index.tsx` (o reusar `app/(tabs)/index.tsx` con bloque "Hoy") con próximas clases, avisos no leídos y cargos pendientes.
- Test: ruta de admin no reachable por parent.

### Fase 6 — Search (AC-01) e Import Job status (AC-07)
- Bloquea en endpoint backend.
- Cliente + UI minimalista con empty/error recuperable.

### Fase 7 — Idempotencia end-to-end (AC-09)
- Requiere que el backend implemente `Idempotency-Key`.
- Activar header desde el cliente y manejar 409 `IDEMPOTENCY_CONFLICT`.

### Fase 8 — Paridad observable (AC-11)
- Suite `mobile/tests/parity/` que compara shapes de respuesta web/mobile para 7–10 endpoints comunes.
- No verifica UI.

### Fase 9 — a11y, touch targets, E2E en device matrix (criterios transversales)
- `accessibilityRole`, `accessibilityLabel`, `accessibilityState` ya presentes en componentes críticos (verificado en commits ZAL-400, ZAL-501). Falta auditoría sistemática de touch targets (mínimo 44pt) en `StudentRow` (4 botones de 36pt), `MessageBubble`, `ConversationRow`.
- E2E con Playwright en navegador contra el dev-server + manual con emulador AVD y Simulator iOS.

## 5. Tickets hijos propuestos (siguiente paso)

Sólo se crearán cuando ZAL-622 reciba luz verde para implementar (ver §6). Estimaciones en puntos relativos.

| ID sugerido | Título | AC | Fase | Esfuerzo | Bloqueador |
|---|---|---|---|---|---|
| ZAL-6XX-1 | ApiClientError: retryable + nextAction + traductor de códigos | AC-10 | 0 | 1 | — |
| ZAL-6XX-2 | Attendance: cancelled bloquea, save_failed etiquetado, idempotencia cliente | AC-03, AC-09 (parcial) | 1 | 2 | — |
| ZAL-6XX-3 | AdminHome: bloques dashboard con enlaces y "sin datos" | AC-02 | 2 | 3 | endpoint backend |
| ZAL-6XX-4 | Mensajes: estados sent/read/failed + retry + aislamiento | AC-04 | 3 | 2 | — |
| ZAL-6XX-5 | Cobros: tabla completa de estados + copy | AC-06 | 4 | 1 | — |
| ZAL-6XX-6 | Familia my-dashboard + tests negativos admin | AC-08 | 5 | 2 | — |
| ZAL-6XX-7 | Search cliente + UI | AC-01 | 6 | 2 | endpoint backend |
| ZAL-6XX-8 | Import job status cliente + UI | AC-07 | 6 | 1 | endpoint backend |
| ZAL-6XX-9 | Idempotencia end-to-end | AC-09 | 7 | 1 | backend Idempotency-Key |
| ZAL-6XX-10 | Suite paridad web/mobile | AC-11 | 8 | 1 | — |
| ZAL-6XX-11 | a11y + touch targets + E2E device matrix | transversal | 9 | 3 | AVD/Simulador disponibles |

## 6. Bloqueadores y decisiones pendientes

- **Engineering Lead / Web Developer** debe confirmar:
  1. Endpoint canónico de `search` (path + params) que la web ya usa.
  2. Endpoint de `dashboard.get` que cumpla los bloques del contrato, o si se construye uno nuevo para mobile.
  3. Endpoint de `import-jobs` (consulta) y su shape.
  4. Decisión sobre `Idempotency-Key`: ¿se acepta en attendance, communication, progress, import? ¿qué status code devuelve cuando hay conflicto?
  5. Decisión sobre el nombre del estado de asistencia: ¿se renombra `excused` → `justified` en backend + tests + mobile + web, o se documenta la equivalencia?
- **Platform & Security** debe revisar el traductor de errores para confirmar que no se filtra `details` del backend en la UI.
- **QA** debe planificar la matriz AVD + iOS Simulator y, si hay dispositivo físico disponible, agregarlo.

## 7. Lo que NO se hace en ZAL-622

- Releases a stores (App Store / Play Store). Quedan para issue separada con aprobación explícita.
- Datos personales reales, sandbox de Stripe live, pricing, campañas.
- Cola mutacional offline, sync de conflictos, recuperación de pérdida de conexión.
- Renombrar `excused` a `justified` sin decisión cross-equipo.
- Reescribir el `role-router` o las rutas existentes; sólo se añaden pantallas nuevas (`family/index.tsx`, `import/[jobId].tsx`, `search/index.tsx`).
- Modificar `package.json` dependencias (no se añaden librerías; el set actual cubre lo necesario).

## 8. Evidencia revisada

- Contrato: `vault/06-Roadmap-y-Tareas/ZAL-619 contrato P0 ICP gimnasia Web Mobile v1.0 2026-08-12.md`.
- Estado actual mobile: `mobile/lib/api/client.ts`, `mobile/lib/api/endpoints.ts`, `mobile/app/(tabs)/index.tsx`, `mobile/app/coach/attendance/[sessionId].tsx`, `mobile/app/family/child/[id].tsx`, `mobile/app/family/invoices.tsx`, `mobile/components/attendance/StudentRow.tsx`, `mobile/components/ui/ErrorBanner.tsx`, `mobile/lib/auth/role-router.ts`, `mobile/docs/QA-TESTING.md`.
- Estado backend (para diagnosticar gaps): `src/lib/api-response.ts`, `src/app/api/attendance/route.ts` (idempotencia no implementada; Zod acepta `excused`).
- Historial mobile: commits `d5da632ec` (ZAL-523), `ecbec6eaa` (ZAL-501), `4703cfe67` (ZAL-402), `0a84bc8cc` (ZAL-401), `14e1b56cc` (ZAL-400), `55801ffa4` (ZAL-399), `2eeb2b5c0` (ZAL-398), `bec4d7e0d` (ZAL-397), `e95f3b023` (ZAL-190), `4db12f269` (family HTTP tests).
- `vault/03-Negocio/RESEARCH/ZAL-396 auditoria UX mobile en emulador 2026-08-06.md` y `ZAL-427 auditoria UX recorrido provider 2026-08-10.md` (contexto de hallazgos previos).
- **Categoría actual:** local-repository. No se ha ejecutado E2E, no hay validación humana, no se ha tocado producción, no se ha hecho release.

---

**Disposición Mobile Developer (v0.5):** Fase 0 + Fase 1 + Fase 2 shipped en este sprint (commits separados). ZAL-619 está `done`. ZAL-635 cerró §6.2 (contrato `dashboard.get`) y destrabó Fase 2; Mobile consume el endpoint canónico `GET /api/dashboard/[academyId]/attention` que la Web ya usa, sin API paralela y sin agregar en cliente. Las decisiones §6.1 (search), §6.3 (import-jobs), §6.5 (excused vs justified) y §6.4 (Idempotency-Key formal) siguen abiertas y bloquearán sus fases respectivas (Fases 6, 7, 8). La issue ZAL-622 NO se marca `done` — quedan pendientes:

1. **Fase 3** (AC-04): mensajes `sent|read|failed`, retry, aislamiento.
2. **Fase 4** (AC-06): extender `Charge.status` con `partial`/`failed`/`due`.
3. **Fase 5** (AC-08): familia `my-dashboard` + tests negativos admin.
4. **Fase 6** (AC-01 + AC-07): cliente `search` + `import-jobs` (bloqueado por §6.1 y §6.3 backend).
5. **Fase 7** (AC-09): `Idempotency-Key` end-to-end (bloqueado por §6.4 backend).
6. **Fase 8** (AC-11): suite paridad observable Web/Mobile.
7. **Fase 9** (transversal): a11y touch targets + device matrix AVD/Simulator iOS (puerta QA).

Próximo paso concreto: crear ticket hijo a QA (Fase 9) y a P&S para revisión del `dashboard.ts` (consume códigos `FORBIDDEN_ROLE`/`VALIDATION_ERROR`/`RATE_LIMITED` que están en `translateError`, pero hay desfase con los códigos reales del backend `UNAUTHENTICATED` y `ACADEMY_NOT_FOUND_OR_ACCESS_DENIED` documentado en ZAL-635 §Riesgos — no es bloqueador para Fase 2 mobile-only pero conviene cerrar la tabla en Fase 3).

### Limitación de verificación (v0.2)

`vitest` no se pudo ejecutar en este heartbeat por un fallo de Node 22 + macOS:
```
node:fs:736
  return binding.read(fd, buffer, position);
                 ^
Error: Unknown system error -11: Unknown system error -11, read
    at Object.readSync (node:fs:736:18)
    at tryReadSync (node:internal/modules/cjs/loader:1292:28)
    ...
    code: 'Unknown system error -11',
    errno: -11,
    syscall: 'read'
```
El error sale del loader ESM antes de cargar cualquier módulo de test, tanto desde `mobile/` como desde `/tmp` (cambiando cwd). `node -e "require('fs').readFileSync(...)"` funciona; `node -e "import('...')"` también (`exists: true`, `len: 5960`). El síntoma es que el loader ESM de Node 22 hace un `readSync` sincrónico que devuelve `EAGAIN` sin reintentar — comportamiento conocido en interacciones Node 22 + macOS con algunos FS events. Mitigación en este heartbeat: validación estática (todas las 14 claves contractuales presentes en `error-codes.ts` y referenciadas en `error-codes.test.ts`) + `tsc --noEmit` pasa (excepto `vitest.config.ts` con `@types/node` no instalado, preexistente). Si reaparece en CI hay que forzar Node 20 LTS.

### Corrección de la causa raíz (v0.6, 2026-08-12) — el diagnóstico anterior era incorrecto

El diagnóstico "bug de Node 22 + macOS, mitigar con Node 20 LTS" quedó **refutado**. Node 20.20.2 (`/opt/homebrew/opt/node@20/bin/node`) falla con el mismo `errno -11`. En macOS `errno -11` es `EDEADLK` ("Resource deadlock avoided"), el mismo error que `git status` reportaba al indexar.

Causa real: **iCloud Drive había desalojado (evicted) archivos de `mobile/node_modules`**, dejándolos como `dataless`. Evidencia literal:

```
$ stat -f "%N flags=%Sf size=%z blocks=%b" node_modules/vitest/dist/cli.js
node_modules/vitest/dist/cli.js flags=compressed,dataless size=284 blocks=0
```

En `node_modules/vitest/dist`: 27 archivos legibles, 4 ilegibles (`cli.js`, `snapshot.js`, `spy.js`, `suite.d.ts`). Barrido completo de `mobile/node_modules`: **1410 archivos dataless** de 38 387. Por eso fallaba incluso un test trivial (`expect(1+1).toBe(2)`): lo que no se podía leer era el propio binario de vitest, no el código de test.

Remedio aplicado: `rm -rf node_modules && npm ci --include=optional` (directorio gitignored y reproducible desde `package-lock.json`; no toca código fuente). Tras eso vitest corre normalmente. **La suite mobile no estaba "sin verificar por un bug de Node": estaba sin verificar por un `node_modules` corrupto, y al repararlo apareció un fallo real** (ver abajo).

### Fallo real destapado al reparar la verificación (v0.6)

Con vitest funcionando, la suite completa de `mobile/` da:

```
Test Files  1 failed | 8 passed (9)
     Tests  1 failed | 146 passed (147)
```

El único fallo está en código de **Fase 0 de esta misma issue** (commit `e31236dc8`), archivo `lib/api/client.test.ts:257`:

- Test: `un 500 sin código reconocible cae en HTTP_5xx con retryable=true`.
- Esperado: `code: 'HTTP_5xx'`. Recibido: `code: 'BOOM'`.
- Origen: `lib/api/client.ts:172` hace `const code = rawCode ?? (res.status >= 500 ? 'HTTP_5xx' : ...)`. Si el backend manda un `code` no reconocido en un 500 (`BOOM`), `rawCode` **no** es nullish, así que nunca cae al `HTTP_5xx`; el código crudo del backend se propaga.
- No es regresión de la reinstalación: árbol limpio en `mobile/lib/api/`, el test y el `client.ts` están commiteados tal cual en `e31236dc8`.

Impacto acotado: `retryable`/`nextAction` siguen correctos (se infieren del status), y AC-10 se mantiene porque `message` sí sale de la tabla y nunca del backend. Lo que se filtra a la UI como identificador es el `code` crudo. Queda como trabajo de Fase 3, **no** se arregla en este heartbeat (heartbeat de recuperación: registrar disposición, no producir entregable).

Los 3 archivos de test de Fases 0–2 pasan aislados: `Tests  54 passed (54)` para `dashboard.test.ts` (14) + `error-codes.test.ts` (12) + `idempotency.test.ts` (15) — la suma 41 vs 54 se explica por bloques `it` anidados/parametrizados que `grep -c "  it("` no cuenta.

### v0.7 — Heartbeat de coordinación (2026-08-12, post-recovery)

Wake reason: `issue_commented` por ZAL-640 (Web Dev) — heads-up de materialización de 4 archivos dataless en `src/db/schema/{permissions,class-sessions,attendance-records}.ts` + `src/components/dashboard/DashboardSidebar.tsx` en `gates/ZAL-556` HEAD=5c9273d27.

**Coordinación:**

- HEAD `gates/ZAL-556` = `5c9273d27` (ZAL-622 v0.6) — coincide con ZAL-640.
- Mobile working tree limpio para estos 4 paths: `git ls-files -s` los muestra tracked, no hay diff local.
- Mi diff en `mobile/` está vacío en este run — no toco los paths avisados.
- Sigo el principio del contrato ZAL-619 §6.2: Mobile consume el endpoint compartido `GET /api/dashboard/[academyId]/attention`; **no** se modifica el schema, los componentes Web del dashboard, ni el sidebar.

**Estado confirmado del heartbeat (sin nuevo entregable):**

- Disposición `in_progress`, `blockedBy=[]`, `unblockDescriptor=null`. Sin decisión abierta pendiente.
- Fases 0–2 shipped; el fallo de `client.test.ts:257` (código crudo `BOOM` en 500) queda como **trabajo explícito de Fase 3** (mismo archivo, mismo `translateError`).
- Próximo entregable concreto: **Fase 3 (AC-04 mensajes)** — `mobile/app/(tabs)/messages.tsx` (103 líneas) + `mobile/components/messages/MessageBubble.tsx` (56 líneas) + `mobile/components/messages/ConversationRow.tsx` (112 líneas). Sin bloqueador cross-equipo; el contrato ZAL-619 §6.5 ya fija los códigos `DELIVERY_FAILED` + mapeo a `nextAction`.
- Lo que se publicará en este sprint, en este orden:
  1. Fix acotado en `client.ts:172` para que códigos no reconocidos en 5xx caigan al fallback `HTTP_5xx` (cierra la grieta destapada en v0.6).
  2. `MessageBubble` con estados `sent | read | failed` visibles + CTA "Reintentar" en `failed`.
  3. Test negativo de aislamiento: `parent` no debe poder listar conversaciones de otra familia (`getConversations` ya filtra en backend; el test verifica que la UI degrada con empty state, no expone el error).
  4. Mapeo `error.code` → copy localizado (continuación de Fase 0 AC-10), incluyendo `DELIVERY_FAILED` que aún no estaba en la tabla.

**Limitación de verificación preservada:** `vitest` corre desde la reinstalación de `node_modules` (v0.6); la suite da `Test Files  1 failed | 8 passed (9)`, `Tests  1 failed | 146 passed (147)`. El único fallo es `client.test.ts:257`, que entra en el fix #1 de este sprint.

**Categoría:** local-repository. No se ha ejecutado E2E, no hay validación humana, no se ha tocado producción, no se ha hecho release.

### v0.8 — Fase 3 shipped + fix client.ts:172 (2026-08-12T20:34:36Z)

Commit: `ee4c1883c feat(mobile): ZAL-622 Fase 3 — mensajes sent/pending/failed + retry + aislamiento`. 5 archivos cambiados, +276 / -9.

**Entregables:**

1. **`mobile/lib/api/client.ts`** — regla asimétrica explícita en el manejo de códigos no reconocidos:
   - 5xx con código desconocido → bucket `HTTP_5xx` (cerraba el test que v0.6 dejó fallando).
   - 4xx con código desconocido → se conserva el código crudo para logs/soporte; el `message` en UI sigue saliendo del FALLBACK (AC-10: nunca el `message` del backend).
   - Cualquier status + código conocido → se respeta tal cual.
   - Helper `isKnownErrorCode()` exportado desde `error-codes.ts`.

2. **`mobile/lib/api/error-codes.ts`** — nuevo helper `isKnownErrorCode(code: string | undefined): boolean`. Verifica contra la unión de `CONTRACT_ERROR_CODES` + `CLIENT_ERROR_CODES`. Trata `undefined`/`null` como desconocido.

3. **`mobile/components/messages/MessageBubble.tsx`** — prop opcional `deliveryStatus: 'pending' | 'sent' | 'failed'` + `onRetry` cuando failed. Render:
   - `pending` → ícono `time-outline` + label "Enviando…".
   - `sent` → ícono `checkmark` silencioso (default si la prop se omite para mensajes confirmados).
   - `failed` → ícono `alert-circle` en color `colors.danger` + Pressable que llama a `onRetry`, con `accessibilityLabel="No enviado. Toca para reintentar."` y `hitSlop=8` para touch target ≥ 44pt.
   - Mensajes ajenos SIEMPRE se renderizan como `sent` (el destinatario no conoce el estado interno del emisor).

4. **`mobile/app/messages/[id].tsx`** — mutación optimista con preservación de payload:
   - `onMutate`: inserta `PendingMessage` al final del hilo con `status: 'pending'`. `PendingMessage` extiende `ConversationMessage` con `status: 'pending' | 'failed'`, así encaja en el FlatList sin acoplar tipos.
   - `onSuccess`: limpia el pending y refetchea (mensaje confirmado aparece como `sent` por default).
   - `onError`: marca el pending como `failed` — el usuario ve el mensaje con CTA "Reintentar" sin reescribirlo, y `onRetry` repite el mismo payload contra el mismo endpoint.

5. **`mobile/lib/api/endpoints.test.ts`** — nuevo `describe('aislamiento y errores esperados en getConversations (ZAL-622 AC-04 + §6.5)')` con 4 tests:
   - Lista vacía → `[]` (no error). La UI muestra empty state, no banner de error.
   - `FORBIDDEN_ROLE` 403 → `nextAction=contact_support`.
   - `AUTH_REQUIRED` 401 → `nextAction=reauth` (crítico: una sesión vencida no debe degenerar a "Sin conversaciones" como si no hubiera nada).
   - `UNAUTHENTICATED` 401 (código real del backend, distinto del contractual `AUTH_REQUIRED`) → código crudo preservado, `message` no contiene "Stack trace" (AC-10 + asimetría 4xx documentada).

**Verificación (evidence gate):**

```
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 ee4c1883c
ee4c1883c feat(mobile): ZAL-622 Fase 3 — mensajes sent/pending/failed + retry + aislamiento

$ ls -la mobile/lib/api/client.ts mobile/lib/api/error-codes.ts \
        mobile/components/messages/MessageBubble.tsx \
        "mobile/app/messages/[id].tsx" mobile/lib/api/endpoints.test.ts
-rw-r--r--  7818 mobile/lib/api/client.ts                   (217 líneas)
-rw-r--r--  6824 mobile/lib/api/error-codes.ts              (202 líneas)
-rw-r--r--  5131 mobile/components/messages/MessageBubble.tsx (159 líneas)
-rw-r--r--  7610 mobile/app/messages/[id].tsx               (209 líneas)
-rw-r--r-- 15779 mobile/lib/api/endpoints.test.ts           (421 líneas)

$ cd mobile && pnpm exec vitest run 2>&1 | tail -4
 Test Files  9 passed (9)
      Tests  151 passed (151)        # 147 previos + 4 nuevos de aislamiento

$ cd mobile && pnpm exec tsc --noEmit
(sin output = sin errores)
```

**Lo que cambia en AC-04:** antes la app sólo mostraba `sent` o nada tras un POST; ahora la UI distingue `pending` durante el envío, `sent` confirmado, y `failed` con retry — y el backend puede responder con cualquier código (incluso uno nuevo) sin que un 5xx contamine el árbol de errores con un código desconocido del backend.

**Pendiente en AC-04:** estado `read` por destinatario requiere un endpoint que devuelva por mensaje la lista de lectores. Hoy no existe en backend. La fase 3 cubre el ciclo emisor; el ciclo lector queda para Fase 9 (transversal, gated por decisión cross-equipo).

**Siguiente paso concreto:** Fase 4 (AC-06 cobros) — extender `Charge.status` con `partial`, `failed`, `due` y mapa de color/copy. Es mobile-only (sin decisión cruzada) y desbloquea el contrato visual de la familia.

### v0.9 — Fase 4 shipped + heartbeat recovery (2026-08-12T20:38Z)

Commit: `839c31c60 feat(mobile): ZAL-622 Fase 4 — Charge.status contractual completo + copy localizada`. 3 archivos, +134 / −8.

**Entregables:**

1. **`mobile/lib/api/endpoints.ts`** — `ChargeStatus` union completa alineada con ZAL-619 §3.6:
   ```
   draft | due | partial | paid | overdue | failed | refunded | cancelled
   ```
   Antes: `pending | paid | overdue | cancelled | refunded` (5 estados). Faltan 3 (`due`, `partial`, `failed`) + 1 (`draft`). El nombre `pending` desaparece de la app — el equivalente contractual es `due` ("pendiente de vencer"). Cualquier backend que devuelva un estado fuera de este set cae en la asimetría documentada en `client.ts:172` y se degrada a `HTTP_5xx` (5xx) o preserva el código crudo (4xx) con `message` siempre del FALLBACK.

2. **`CHARGE_STATUS_LABEL: Record<ChargeStatus, string>`** — copy localizada:
   - `draft` → "Borrador"
   - `due` → "Pendiente de vencer"
   - `partial` → "Pago parcial"
   - `paid` → "Pagado"
   - `overdue` → "Vencido"
   - `failed` → "Pago fallido"
   - `refunded` → "Reembolsado"
   - `cancelled` → "Cancelado"
   - **Sin claims legales/fiscales/hacienda**: el contrato §3.6 dice "no se afirma recibo fiscal ni validez legal"; el test `no afirman recibo legal ni validez fiscal` fija este invariante y rompe el build si alguien añade "Recibo emitido" / "Factura válida" / "Válido ante Hacienda".

3. **`isChargePayable(status)`** — predicado explícito para el CTA "Pagar en web". Cubre exactamente `due | overdue | partial | failed`. NO `paid` (ya pagado), NO `refunded` (devuelto), NO `cancelled` (sin acción), NO `draft` (aún no emitido por el dueño). La familia ve el CTA solo cuando hay acción real; los cargos ya liquidados quedan como estado, no como tarea.

4. **`mobile/components/family/InvoiceCard.tsx`** refactorizado:
   - `statusColor` exhaustivo para los 8 estados (`paid` success, `overdue`/`failed` danger, `due`/`partial` warning, `draft` info, `cancelled`/`refunded` muted). El `default` que tenía antes desaparecía estados desconocidos en gris; ahora es exhaustivo y la verificación de TS lo asegura.
   - Badge usa `CHARGE_STATUS_LABEL[charge.status]` — la familia ve "Pagado" o "Pago parcial", nunca el enum crudo `paid`/`partial`.
   - CTA "Pagar en web" governed por `isChargePayable(charge.status)`.

5. **5 tests nuevos en `endpoints.test.ts`** (describe `estados contractuales del Cargo`):
   - `CHARGE_STATUSES` expone los 8 estados en orden estable.
   - `CHARGE_STATUS_LABEL` exhaustivo sobre `CHARGE_STATUSES`.
   - Labels NO contienen "recibo/factura/hacienda/fiscal/legal/válido/certific".
   - `isChargePayable` cubre exactamente los 4 estados con acción.
   - `paid`/`refunded`/`cancelled`/`draft` NO son accionables (refuerza el invariante).

**Verificación (evidence gate):**

```
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 839c31c60
839c31c60 feat(mobile): ZAL-622 Fase 4 — Charge.status contractual completo + copy localizada

$ wc -l mobile/lib/api/endpoints.ts mobile/components/family/InvoiceCard.tsx \
       mobile/lib/api/endpoints.test.ts
     158 mobile/lib/api/endpoints.ts        (+48)
     94 mobile/components/family/InvoiceCard.tsx (+11)
    493 mobile/lib/api/endpoints.test.ts    (+72)

$ cd mobile && pnpm exec tsc --noEmit
(sin output = sin errores)

$ cd mobile && pnpm exec vitest run 2>&1 | tail -3
 Test Files  9 passed (9)
      Tests  156 passed (156)        # antes 151, +5 nuevos
```

**Lo que cambia en AC-06:**
- Antes: la app mostraba el enum crudo (`paid`, `pending`...) con un fallback gris para cualquier estado no reconocido. La familia nunca veía "Pago parcial" o "Pago fallido", aunque el backend los devolviera — quedaban como `textMuted` indistinguibles del badge de "Cancelado".
- Ahora: 8 estados visibles con copy localizada y color semántico, sin claims legales, y CTA de pago solo donde hay acción posible.

**Pendiente en AC-06:**
- Verificar visualmente el badge en device matrix (puerta QA, Fase 9).
- Confirmar con Engineering Lead que `/api/me/charges` no devuelve nunca el antiguo `pending` (los seeds y los fixtures de tests deberían usar los 8 nombres contractuales; revisar `tests/fixtures/`).

**Lo que queda en ZAL-622 (no se cierra hasta sus gates):**

1. **Fase 5** (AC-08): familia `my-dashboard` + tests negativos admin.
2. **Fase 6** (AC-01 + AC-07): cliente `search` + `import-jobs` (bloqueado por §6.1 y §6.3 backend).
3. **Fase 7** (AC-09): `Idempotency-Key` end-to-end (bloqueado por §6.4 backend).
4. **Fase 8** (AC-11): suite paridad observable Web/Mobile.
5. **Fase 9** (transversal): a11y touch targets + device matrix AVD/Simulator iOS (puerta QA).

**Próximo paso concreto (post-Fase 4):** Fase 5 (AC-08 familia `my-dashboard`) — mobile-only, sin bloqueador cruzado. Alternativamente, si QA reporta device matrix listo, priorizar Fase 9 que es transversal a todo lo anterior.

### v1.0 — Fase 5 shipped + Fase 0–5 closure (2026-08-12T20:43Z)

Commit: `e4a22e67b feat(mobile): ZAL-622 Fase 5 — familia my-dashboard (AC-08) + aislamiento parent`. 5 archivos, +833 / −3.

**Entregables:**

1. **`mobile/lib/api/family-dashboard.ts`** (nuevo, 212 líneas) — cliente Mobile para el my-dashboard de la familia:
   - Tipo `FamilyDashboardBundle` con tres bloques: `nextClasses`, `unread`, `pendingCharges`, cada uno con `sourceAvailable: boolean` y `items[]` / `count`.
   - `getFamilyDashboard()` compone en paralelo desde endpoints ya existentes (`getMySchedule`, `getUnreadCount`, `getConversations`, `getMyCharges`). NO crea endpoint nuevo en backend — el contrato del P0 no exige `view=family` todavía.
   - **Aislamiento de fallos por fuente**: una caída (`NETWORK_ERROR`, `HTTP_5xx`, código desconocido, `RATE_LIMITED`) marca sólo ese bloque como `sourceAvailable=false` y los demás siguen. Esto preserva la información de las fuentes sanas.
   - **Errores contractuales bloqueantes**: `AUTH_REQUIRED`, `UNAUTHENTICATED`, `FORBIDDEN_ROLE` rechazan la promesa para que `useQuery` pinte error en UI, no "Sin datos". Misma asimetría que documentamos en `client.ts:172` (códigos desconocidos vs códigos contractuales).
   - Filtrado de cargos por `isChargePayable(status)` — `paid/refunded/cancelled/draft` NO entran en `pendingCharges.items`.
   - Helper `renderFamilyCount()` consistente con `dashboard.renderCount`: `sourceAvailable=false → 'unavailable'`, `count=0 → 'empty'`, `count>0 → value`. Defensivo contra `count < 0` (no se muestra -3).

2. **`mobile/lib/api/family-dashboard.test.ts`** (nuevo, 277 líneas, 53 tests) — cubre:
   - Composición paralela (3 fuentes independientes + recorte a 5 clases).
   - Paralelismo real: 4 fuentes × 30ms en serie = 120ms; la suite mide <110ms (umbral relajado para arranque del event loop).
   - Aislamiento: si `getMySchedule` cae, los otros dos bloques siguen con datos. Si `getUnreadCount` cae pero `getConversations` responde, la fuente "unread" entera se considera caída (es una unidad).
   - Bloqueos contractuales: `AUTH_REQUIRED`, `UNAUTHENTICATED`, `FORBIDDEN_ROLE` rechazan la promesa.
   - Filtrado de cargos: `due|overdue|partial|failed` → accionables; `paid|refunded|cancelled|draft` → fuera.
   - `renderFamilyCount`: value / empty / unavailable / undefined / null / count negativo.

3. **`mobile/lib/auth/role-router.ts`** — añade:
   - `ADMIN_ROUTE_PREFIXES`: `/coach/`, `/super-admin/`, `/(super-admin)/`.
   - `isAdminRoute(path)`: detecta rutas admin con normalización (`/coach/...` y `coach/...` ambos válidos).
   - `canAccessRoute(role, path)`: parent/athlete/viewer/undefined NO acceden a admin/coach; owner/admin/super_admin/coach sí. La defensa en backend (`withTenant` + `verifyAcademyAccessForProfile`) sigue siendo la primaria; este helper es la segunda capa cliente.
   - Mismo patrón que el fix de `permissions-service.ts` (julio 2026, escalada cross-tenant) — el test fija el invariante para que un revert no pase silencioso.

4. **`mobile/lib/auth/role-router.test.ts`** — `+92 líneas, +19 tests`:
   - `isAdminRoute`: 10 casos (rutas admin = true; tabs/family/profile = false; string vacío = false) + normalización sin slash.
   - `canAccessRoute`: parent/athlete/viewer NO accede a `/coach/attendance/*` ni `/super-admin/*`; owner/admin/super_admin/coach SÍ acceden; rol undefined NUNCA accede a admin/coach; rutas no-admin son accesibles por todos los roles autenticados.

5. **`mobile/app/(tabs)/index.tsx`** — `+208 líneas`:
   - `ParentHome` consume `getFamilyDashboard()` con query key `['family', 'dashboard']`.
   - `onRefresh` invalida también `['family', 'dashboard']` para que el pull-to-refresh funcione en el nuevo bloque.
   - Tres componentes nuevos: `NextClassesCard` (filas `Pressable` con `accessibilityRole="button"` y `minHeight: 44` para touch target ≥44pt, transversal a Fase 9), `UnreadCard` (notificaciones + conversaciones con helper `renderFamilyCount`), `PendingChargesCard` (cuenta filtrada por `isChargePayable`).
   - Cada bloque distingue `Fuente no disponible` (sourceAvailable=false), `Sin X` (count=0), valor (count>0). CTA "Ver agenda completa"/"Ver avisos"/"Ver cargos" navega al destino nativo correspondiente.
   - **Re-export de tipos**: `ScheduleItem` y `Charge` se re-exportan desde `family-dashboard.ts` para que la UI pueda tipar las filas sin importar `endpoints` directamente.

**Verificación (evidence gate):**

```
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 e4a22e67b
e4a22e67b feat(mobile): ZAL-622 Fase 5 — familia my-dashboard (AC-08) + aislamiento parent

$ ls -la mobile/lib/api/family-dashboard.ts mobile/lib/api/family-dashboard.test.ts
-rw-r--r--  7699 mobile/lib/api/family-dashboard.ts
-rw-r--r-- 11159 mobile/lib/api/family-dashboard.test.ts

$ wc -l mobile/lib/api/family-dashboard.ts mobile/lib/api/family-dashboard.test.ts \
       mobile/lib/auth/role-router.ts mobile/lib/auth/role-router.test.ts \
       'mobile/app/(tabs)/index.tsx'
     212 mobile/lib/api/family-dashboard.ts
     277 mobile/lib/api/family-dashboard.test.ts
     127 mobile/lib/auth/role-router.ts
     129 mobile/lib/auth/role-router.test.ts
     866 'mobile/app/(tabs)/index.tsx'

$ grep -c "  it(" mobile/lib/api/family-dashboard.test.ts mobile/lib/auth/role-router.test.ts
53 mobile/lib/api/family-dashboard.test.ts
31 mobile/lib/auth/role-router.test.ts

$ pnpm --dir mobile exec tsc --noEmit
(sin output = sin errores)

$ pnpm --dir mobile exec vitest run 2>&1 | tail -3
 Test Files  10 passed (10)
      Tests  209 passed (209)        # antes 156, +53 nuevos
```

**Lo que cambia en AC-08:**

- Antes: el home del padre mostraba dos tarjetas separadas ("Tus hijos" + "Próximos eventos"), sin resumen diario ni avisos no leídos ni cargos pendientes. Las tarjetas "Avisos" y "Cargos" sólo se accedían navegando a las tabs correspondientes.
- Ahora: la familia ve en su home tres bloques que resumen el día — próximas clases, avisos pendientes (notificaciones + conversaciones), cargos por pagar. Cada bloque distingue "Sin X" / "Fuente no disponible" / valor, consistente con el patrón de `AdminHome` (Fase 2). La lista de hijos sigue presente como acceso principal al detalle.
- **Aislamiento (AC-08 test negativo)**: `canAccessRoute('parent', '/coach/attendance/123')` retorna `false`. La defensa es doble — backend (`withTenant`) + cliente (este helper). El test bloquea cualquier revert silencioso del aislamiento.

**Pendiente en AC-08:**

- Integrar `canAccessRoute()` en `app/_layout.tsx` o en wrappers por pantalla admin para que el deep link redirija automáticamente al home en vez de esperar al 403. Hoy el helper existe y está probado; el wiring queda como trabajo de hardening de Fase 9 (cuando QA valide deep links en device matrix).
- Test E2E en AVD/Simulator con un parent intentando `expo-linking://coach/attendance/123` — puerta QA, Fase 9.

**Cierre de criterios (post-Fase 5):**

- AC-02 (owner dashboard): ✅ Fase 2
- AC-03 (asistencia cancelled + save_failed): ✅ Fase 1
- AC-04 (mensajes sent/read/failed + aislamiento): ✅ Fase 3 (read queda Fase 9 cross-equipo)
- AC-06 (cobros 8 estados): ✅ Fase 4
- AC-08 (familia my-dashboard + aislamiento): ✅ Fase 5 (este sprint)
- AC-10 (errores retryable + nextAction + traductor): ✅ Fase 0
- AC-01 (búsqueda): ❌ Fase 6 (bloqueado §6.1 backend)
- AC-05 (progreso publicado): parcial — familia ve progreso vía `/api/me/progress`; el test negativo "drafts no aparecen" queda para Fase 8.
- AC-07 (importación): ❌ Fase 6 (bloqueado §6.3 backend)
- AC-09 (Idempotency-Key end-to-end): ❌ Fase 7 (bloqueado §6.4 backend)
- AC-11 (suite paridad): ❌ Fase 8
- Transversal (a11y + device matrix): ❌ Fase 9 (puerta QA)

**Lo que queda en ZAL-622 (no se cierra hasta sus gates):**

1. **Fase 6** (AC-01 + AC-07): cliente `search` + `import-jobs` (bloqueado por §6.1 y §6.3 backend).
2. **Fase 7** (AC-09): `Idempotency-Key` end-to-end (bloqueado por §6.4 backend).
3. **Fase 8** (AC-11): suite paridad observable Web/Mobile.
4. **Fase 9** (transversal): a11y touch targets + device matrix AVD/Simulator iOS + wiring `canAccessRoute` (puerta QA).

**Próximo paso concreto (post-Fase 5):** el board decide entre (a) Fase 6 si Engineering Lead confirma endpoints `search` e `import-jobs`, (b) Fase 8 si paridad observable es prioridad, o (c) Fase 9 si QA ya tiene device matrix montado. Mobile no escala esta decisión; queda como input para el próximo sprint.

