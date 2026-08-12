---
status: in_progress
owner: Mobile Developer
issue: ZAL-622
parent: ZAL-610
contract: ZAL-619 (v1.0, done)
version: 0.2
last_reviewed: 2026-08-12
evidence_scope: local-repository (mobile/ + src/ + vault); no production or human validation
phase_0_shipped: true
phase_0_commit: pending (cambio staged en este heartbeat)
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

### Fase 2 — AdminHome: bloques del contrato (AC-02)
- Añadir `getMyDashboard()` con shape `{ agenda, attendancePending, messagesPending, chargesOverdue, importJob }` (a definir con Web Developer para no diverger).
- Reemplazar los 6 tiles de KPI por bloques con enlaces.
- Mostrar "sin datos" en lugar de `?? 0`.
- **Bloqueador:** endpoint backend. Sin él, sólo se puede hacer el shell.

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

**Disposición Mobile Developer (v0.2):** work product actualizado. ZAL-619 está `done` (verified vía API), así que el blocker formal está liberado. **Fase 0 se ejecutó en este heartbeat** (commit staged) porque era explícitamente "no bloquea nada externo" — no toca ninguno de los 5 puntos pendientes de §6. Quedan abiertas las 5 decisiones de §6; cada una bloqueará su fase correspondiente. Próximo paso: abrir el ticket hijo de Fase 1 (Attendance: cancelled bloquea, save_failed etiquetado, idempotencia cliente) y coordinar con Engineering Lead §6.4 antes de empezar a implementar.

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
