---
status: work-product
owner: web-developer
issue: ZAL-621
parent: ZAL-610
sibling_contract: ZAL-619
last_reviewed: 2026-08-12
evidence_scope: local-repository-and-vault; QA re-execution pending (environment blocker)
---

# ZAL-621 — Work product: Rendimiento y accesibilidad de recorridos Web del dueño y coach

## Alcance ejecutado

Auditoría estática + extensión reproducible de cobertura a11y E2E para las 10 rutas Web P0 del contrato [`ZAL-619 contrato P0 ICP gimnasia Web Mobile v1.0`](./ZAL-619%20contrato%20P0%20ICP%20gimnasia%20Web%20Mobile%20v1.0%202026-08-12.md):

| Recorrido P0 | Ruta Web | Cobertura previa | Hallazgo |
|---|---|---|---|
| Búsqueda | `/app/{academyId}/search?…` (command palette + `/api/search`) | Ninguna directa | `/api/search/route.ts` existe pero la página `search/page.tsx` no aparece en el árbol (`src/app/api/search/route.ts` + `src/components/search/GlobalSearchDialog.tsx`); la búsqueda vive como command palette en `CommandDialog`. Queda como gap de cobertura del recorrido "búsqueda" en términos de página dedicada. |
| Dashboard operativo | `/app/{academyId}/dashboard` | `a11y-zaltyko.spec.ts` (axe) + ZAL-604 focal (responsive/teclado) + WCAG AA contraste ZAL-604 | OK cobertura heredada. |
| Agenda | `/app/{academyId}/classes` | E2E `e2e-zaltyko-full.spec.ts` | Sin axe WCAG AA directo. **Cobertura nueva por este spec.** |
| Asistencia | `/app/{academyId}/attendance` | E2E `e2e-zaltyko-full.spec.ts` | Sin axe WCAG AA directo. **Cobertura nueva por este spec.** |
| Comunicación | `/app/{academyId}/comms` + `/announcements` + `/messages` | E2E parcial | Sin axe WCAG AA directo. **Cobertura nueva por este spec.** |
| Progreso | `/app/{academyId}/evaluations` | E2E parcial | Sin axe WCAG AA directo. **Cobertura nueva por este spec.** |
| Cobros | `/app/{academyId}/billing` | E2E parcial | Sin axe WCAG AA directo. **Cobertura nueva por este spec.** |
| Portal familiar | `/app/{academyId}/my-dashboard` | E2E `e2e-zaltyko-stripe-connect-flow.spec.ts` (autenticado parent) | Sin axe WCAG AA directo. **Cobertura nueva por este spec.** |
| Atletas | `/app/{academyId}/athletes` | `a11y-zaltyko.spec.ts` (axe) + ZAL-604 focal + WCAG contraste | OK cobertura heredada. |

## Cambios entregados

### Spec nuevo `tests/e2e-zal-621-a11y-journeys.spec.ts`

Commit canónico `d0b723b3eaef78c22c732794c8c4554bd0b60e8a`. **294 tests** declarados en `pnpm exec playwright test --list tests/e2e-zal-621-a11y-journeys.spec.ts` × 3 proyectos (chromium/firefox/webkit). Tres `describe`:

1. **axe WCAG 2.2 AA** sobre las **8 rutas P0 no cubiertas** por `tests/a11y-zaltyko.spec.ts`: classes, attendance, comms, announcements, messages, evaluations, billing, my-dashboard. Tags `["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]`. `dashboard` y `athletes` quedan fuera a propósito para no duplicar.
2. **Matriz responsive 3 viewports × 10 rutas** (`1280×800` desktop, `390×844` mobile, `320×568` small mobile). Dos asserts por celda: ausencia de "Failed query / Application error" en la página y `documentElement.scrollWidth ≤ clientWidth + 1`.
3. **Matriz teclado/foco 3 viewports × 10 rutas**: tras pulsar `Tab` cinco veces desde el primer focusable, cada `document.activeElement` debe ser visible (`display !== "none"`, `visibility !== "hidden"`, `getBoundingClientRect().width/height > 0`).

Patrón equivalente a `tests/e2e-zal-604-a11y-focal.spec.ts` (mismas constantes `viewports`, misma estructura serial). Skip limpio sin `E2E_ACADEMY_ID` + `E2E_STORAGE_STATE` para no romper `pnpm test:a11y` en sandboxes sin academia aislada.

### Hallazgos estáticos (sin levantar el dev server)

#### 1. Cobertura de `loading.tsx` vs `error.tsx` en rutas P0

| Ruta | `loading.tsx` | `error.tsx` |
|---|---|---|
| `/app/{academyId}/dashboard` | OK | **MISS** |
| `/app/{academyId}/classes` | OK | **MISS** |
| `/app/{academyId}/attendance` | OK | **MISS** |
| `/app/{academyId}/comms` | OK | **MISS** |
| `/app/{academyId}/announcements` | OK | **MISS** |
| `/app/{academyId}/messages` | OK | **MISS** |
| `/app/{academyId}/evaluations` | OK | **MISS** |
| `/app/{academyId}/billing` | OK | **MISS** |
| `/app/{academyId}/my-dashboard` | OK | **MISS** |
| `/app/{academyId}/athletes` | OK | **MISS** |

**0/10** rutas P0 tienen `error.tsx` propio. Cualquier error no controlado en una página P0 burbujea al `src/app/error.tsx` raíz. El boundary raíz está sano (`Sentry.captureException` + `redactError` + `redactSensitive` + reset + volver a `/`), pero:

- La UI de error raíz no preserva el contexto de la academia ni ofrece "Reintentar en esta página" preservando el `tenantId`/`academyId`.
- El copy ("Algo salió mal / Ha ocurrido un error inesperado") no identifica la ruta ni distingue permisos (ZAL-619 AC-10: "ningún fallo se presenta como guardado/pagado/enviado"; este boundary cumple la parte de honestidad, pero el siguiente paso visible es siempre `/` y eso puede confundir a un coach en medio de pasar lista).

Recomendación P0: añadir un `error.tsx` por ruta P0 que preserve la academia en la URL y ofrezca reintento local + enlace a soporte. No se aplica en este heartbeat (ver bloqueadores abajo).

#### 2. Instrumentación de rendimiento Web

- **0 hits** de `web-vitals`, `onLCP`, `onINP`, `onCLS`, `performance.measure` o `performance.now` en `src/lib` y `src/app` (grep limitado por el bloqueador iCloud dataless).
- No existe un cliente de Web Vitals que reporte a `/api/telemetry/*` ni a PostHog/Sentry desde la Web.
- El único observability client visible es `src/components/PostHogProvider.tsx` (PostHog) — sin hook de web-vitals conectado.

Recomendación P0: añadir un `src/lib/perf/web-vitals.ts` que use `web-vitals` (paquete ya en el árbol por dependencias transitivas de `@next/third-parties` o a añadir) y reporte a `/api/telemetry/perf` con `requestId`, `academyId` contextual, `route`, `device`, `viewport`. Eso habilita el "registrar p50/p95 por tarea, dispositivo, red y entorno" que pide ZAL-619 AC-5 sin publicar umbral.

#### 3. Búsqueda dedicada vs command palette

- No existe `src/app/app/[academyId]/search/page.tsx`. La búsqueda vive como command palette (`src/components/search/GlobalSearchDialog.tsx`) accesible con `⌘K`/atajo, y la API en `src/app/api/search/route.ts`.
- El recorrido P0 de ZAL-619 ("el usuario autorizado puede buscar por nombre de gimnasta, grupo o coach") se cumple por command palette, no por ruta canónica `/search`.
- Implicación: una URL pública compartida que contenga `?q=jimena` no abre la búsqueda. Decisión de producto, no defecto técnico.

#### 4. Estados de carga y error en componentes hoja ya auditados

- `AttendanceSheet.tsx` mantiene el contrato de ZAL-619: `setStatuses` local optimista, `setFailedIds` para distinguir confirmado vs pendiente, `useTransition` para no bloquear UI, `useToast` para notificar. Conserva la separación `confirmed`/`pending`/`failed` que pide AC-10.
- `CommunicationHub.tsx` y `GlobalSearchDialog.tsx` usan `useState` + `setIsLoading`; los placeholders existen, no se expone estado de éxito cuando la respuesta es `error`.
- `MyDashboardPage.tsx` (`/app/[academyId]/my-dashboard`) usa `force-dynamic` + `db.select` directo + redirección por sesión; correcto, sin `searchParams` que filtren PII.

## Métricas de p95 — definición reproducible (lo que el spec NO captura y por qué)

El contrato ZAL-619 AC-5 pide "registrar p50/p95 por tarea, dispositivo, red y entorno; no publicar umbral ni claim de '3 segundos' hasta validación suficiente". Esta ZAL-621 **no introduce p50/p95 numéricos** en este heartbeat por dos motivos:

1. **Bloqueador de entorno externo** (ver §Verificación pendiente): `pnpm dev` falla con `Error: Unknown system error -11` (errno -11) por archivos iCloud Drive `dataless` (mismo síntoma ZAL-604, fix parcial en `f620fb49f` solo cubre el walker de gates). `nc -z db.aeeootdmuiqkfeernskw.supabase.co 443` → `nodename nor servname provided`. Sin dev server materializado no se puede capturar tráfico real contra `/api/dashboard/kpi-trends`, `/api/attendance`, `/api/search`, etc.
2. **P50/p95 con N<10 es ruido**: sin 10–20 iteraciones por ruta y por viewport no hay distribución defendible; publicar un único número sería exactamente el claim de "3 segundos" que ZAL-610 prohíbe.

Lo que el spec **sí deja reproducible** (cuando QA levante el entorno) es el harness para empezar a capturar p50/p95:

- `tests/e2e-zal-621-a11y-journeys.spec.ts` declara 3 viewports y la navegación a cada ruta; el siguiente paso natural es envolver cada `gotoAcademy` con `performance.timing`/`PerformanceObserver` para `domcontentloaded`, `load`, `first-contentful-paint` y la primera mutación post-API.
- `tests/e2e-zaltyko-full.spec.ts` ya cubre "responsive shell works at Sprint 3 audit breakpoints" como sanity check.

## Verificación pendiente (gap explícito)

En este heartbeat **no se pudo ejecutar el spec ni reproducir el dev server**:

- `pnpm typecheck` falla con `TS6053: File 'src/types/athletes.ts' not found` (mismo síntoma que el `git status` arriba: el archivo está físicamente en `src/types/athletes.ts` pero el sistema reporta "Resource deadlock avoided" al leerlo; `dd if=src/types/athletes.ts of=/dev/null bs=64 count=1` → `Resource deadlock avoided`). Esto es iCloud Drive dataless, no regresión de código.
- `pnpm dev` no se intentó (sabido bloqueado).
- `pnpm exec playwright test tests/e2e-zal-621-a11y-journeys.spec.ts --project=chromium` no se intentó (requiere dev server + `E2E_ACADEMY_ID` + `E2E_STORAGE_STATE`).
- `pnpm exec playwright test --list tests/e2e-zal-621-a11y-journeys.spec.ts` **sí corrió** y devolvió `Total: 294 tests in 1 file` (8 axe + 30 render + 30 overflow + 30 teclado × 3 proyectos) — eso verifica que el spec parsea, importa correctamente y registra los describe/it anidados contra Playwright.

Esta evidencia local/sandbox **no es** readiness ni validación humana. **QA debe re-verificar** los 294 tests cuando:

- iCloud Drive dataless esté resuelto (materializar manualmente `src/types/*.ts`, `src/utils/*.ts`, `src/components/dashboard/DashboardSidebar.tsx`, `tests/lib/subscription-status.test.ts` y los demás archivos en `@`-marked con extended attribute `com.apple.provenance` que no están materializados).
- `E2E_ACADEMY_ID` + `E2E_STORAGE_STATE` estén disponibles con la academia aislada sintética.

## Comandos a re-ejecutar por QA (literales)

```bash
cd /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko

# Materializar archivos iCloud dataless primero (mientras el dev server
# siga bloqueado por errno -11). Esto desbloquea typecheck, lint, dev y tests.
xattr -r -d com.apple.provenance src/ tests/ scripts/

# Typecheck post-materialización
pnpm typecheck

# Levantar dev server
pnpm dev

# Spec nuevo ZAL-621 (294 tests, requiere academia aislada)
E2E_ACADEMY_ID=… E2E_STORAGE_STATE=… BASE_URL=http://127.0.0.1:3000 \
  pnpm exec playwright test tests/e2e-zal-621-a11y-journeys.spec.ts \
  --project=chromium

# Spec público existente (no requiere academia)
pnpm test:a11y:public   # tests/a11y-zaltyko.spec.ts describe público

# Spec autenticado existente (sí requiere academia)
pnpm test:a11y
```

## Contrato backend compartido — auditoría estática de no duplicación Web/Mobile

El contrato ZAL-619 §6 define 9 operaciones mínimas (`search`, `dashboard.get`, `agenda.list`, `attendance.upsert`, `communication.send`, `progress.save`, `charges.list`, `manualPayment.record`, `import.preview/validate/commit/rollback`). Auditoría rápida de qué consume Web vs Mobile:

| Operación ZAL-619 | Endpoint backend (Web) | Cliente Mobile | Notas |
|---|---|---|---|
| `search` | `/api/search` (GET) | cliente API Bearer con `/search` (paridad presumible; pendiente QA cross-PR) | OK Web |
| `dashboard.get` | `/api/dashboard/kpi-trends`, `/api/dashboard/financial-metrics`, etc. | dashboard resumido Mobile | OK Web |
| `agenda.list` | `/api/classes/*`, `/api/sessions/*` | `/sessions`, `/classes` Mobile | OK Web |
| `attendance.upsert` | `/api/attendance` (POST) | `/attendance` Mobile | OK Web |
| `communication.send` | `/api/comms/*`, `/api/messages/*`, `/api/announcements/*` | `/messages`, `/announcements` Mobile | Web tiene 3 entrypoints; revisar si Mobile consolida |
| `progress.save` | `/api/evaluations`, `/api/assessments/*` | `/assessments`, `/evaluations` Mobile | OK Web |
| `charges.list` | `/api/charges`, `/api/billing/*` | `/billing`, `/me/charges` Mobile | OK Web |
| `manualPayment.record` | `/api/charges/[id]/manual-payment` (ver `src/app/api/charges/*`) | idem | OK Web |
| `import.*` | `/api/athletes/import` (CSV hoy; no preview/mapping aún) | sin import en Mobile (P0: "Mobile puede consultar el estado y los errores del job, pero no necesita cargar el archivo") | Web OK, Mobile consulta job |

No se observa **duplicación de reglas de cliente** entre Web y Mobile en la auditoría estática: ambos consumen los mismos endpoints `/api/*` con cliente API distinto (Web con `withTenant`, Mobile con bearer). Las reglas de validación/autorización viven en el servidor.

## Riesgo residual y follow-up

- **iCloud dataless + DNS egress Supabase** siguen siendo bloqueadores de primera clase del entorno (fuera del alcance de ZAL-621; los mantiene P&S / Engineering Lead).
- **Falta `error.tsx` por ruta P0** — hallazgo reproducible y remediable en un heartbeat futuro cuando el entorno levante.
- **Falta instrumentación de Web Vitals** — habilita el "registrar p50/p95" del contrato AC-5 sin claim externo.
- **Búsqueda como command palette** — ZAL-619 habla de "búsqueda" como tarea observable; la ruta dedicada `/search` no existe y eso es una decisión de producto pendiente, no un defecto técnico.
- **No se evalúa compatibilidad con móvil antiguo ni fluidez comparativa** (eso pertenece a ZAL-622 Mobile según el desglose ZAL-610 §Handoffs).
- **No se contrasta copia comercial** ("3 segundos", "móvil antiguo", "offline"): el contrato ZAL-619 §8 los prohíbe como claim, así que el work product no los mide.

## Límites respetados (per ZAL-621 description)

- Sin copy, permisos, auth, datos, migraciones, secretos ni producción.
- Sin cambios a componentes existentes ni reglas de layout.
- No se introducen endpoints nuevos, ni schemas, ni Drizzle.
- No se toca Mobile: el spec es solo Web.
- No se reabre ZAL-587 (super-admin) ni ZAL-477 (piloto) — los hallazgos son referencias cruzadas, no duplicación.

## Archivos tocados

- `tests/e2e-zal-621-a11y-journeys.spec.ts` (nuevo, 233 LOC) — commit `d0b723b3eaef78c22c732794c8c4554bd0b60e8a`.

## Relación con QA y Mobile

- QA [ZAL-628](/ZAL/issues/ZAL-628) queda como issue dependiente para re-ejecutar el spec cuando el entorno esté sano.
- Mobile [ZAL-622](/ZAL/issues/ZAL-622) cubre la mitad complementaria (device matrix y rendimiento Mobile); ZAL-621 Web entrega el lado Web de la misma matriz AC-01–AC-12 sin duplicar contrato.
- Diseño [ZAL-630](/ZAL/issues/ZAL-630) y datos [ZAL-631](/ZAL/issues/ZAL-631) cubren los hallazgos de foco/tarea y de instrumentación p50/p95 respectivamente.