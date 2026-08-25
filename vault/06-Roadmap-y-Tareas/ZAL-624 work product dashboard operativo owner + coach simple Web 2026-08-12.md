---
status: work-product
owner: web-developer
issue: ZAL-624
parent: ZAL-610
sibling_contract: ZAL-619
related: ZAL-621 (a11y/perf), ZAL-622 (paridad Mobile), ZAL-630 (UX)
last_reviewed: 2026-08-12
evidence_scope: local-repository-and-vault; iCloud dataless bloquea dev server
---

# ZAL-624 — Work product: Dashboard operativo Web del dueño + modo simple para coach

## Alcance ejecutado

Construir la **vista de trabajo** del dueño académico y un **modo simple/read-only** para el coach bajo el contrato [`ZAL-619 contrato P0 ICP gimnasia Web Mobile v1.0`](./ZAL-619%20contrato%20P0%20ICP%20gimnasia%20Web%20v1.0%202026-08-12.md), **sin reutilizar** el dashboard super-admin de [ZAL-590](/ZAL/issues/ZAL-590) y **sin pisar** la página de vanity board heredada en `/app/[academyId]/dashboard` (sigue existiendo, este work product añade un recorrido nuevo).

### Lo que entrega

1. **Endpoint compartido Web/Mobile** `GET /api/app/[academyId]/dashboard/attention` que devuelve un único payload de "atención" del dueño/coach: agenda de hoy, asistencia pendiente, mensajes/avisos pendientes, cargos vencidos o fallidos, progreso en borrador, estado de import job, y una **acción prioritaria** derivada. Misma forma sirve a la Web y a Mobile.
2. **Endpoint `GET /api/app/[academyId]/dashboard/attention`** con `view=coach` que entrega el subset read-only (sin cobros, sin import, sin permisos).
3. **Página Web nueva** `/app/[academyId]/dashboard/at-a-glance` (owner) que renderiza el bloque `attention` con acción prioritaria, recorrido corto al detalle y estados `empty`/`error` honestos.
4. **Página Web nueva** `/app/[academyId]/coach/today-simple` (coach) que renderiza el subset read-only con foco en "qué tengo que dar hoy" y enlaces a asistencia/progreso.
5. **Componentes cliente** `OwnerAttentionPanel.tsx` y `CoachSimplePanel.tsx` (sin `?? 0` — "sin datos" cuando no hay fuente), accesibles, con estados `loading`/`ready`/`empty`/`error` diferenciados.
6. **Tests** unitarios del agregador `getAttentionBundle()` y del formateo de estados. Spec de Playwright a11y para la nueva ruta (igual patrón que ZAL-621).

### Lo que NO entrega (acotado por ZAL-619 §8 y descripción de la issue)

- No modifica `src/components/dashboard/DashboardPage.tsx` (vanity board) — solo añade la nueva ruta `/at-a-glance`.
- No reutiliza el motor super-admin de ZAL-590; lee directo DB scoped por `academyId` desde el servidor.
- No cambia pricing, copy, claims, planes, Stripe, secretos ni rutas admin existentes.
- No introduce estados nuevos; usa los definidos en el contrato ZAL-619 §5.
- No introduce web-vitals ni export a PostHog (eso es recomendación de ZAL-621 §2.2, queda para otro heartbeat).
- No hace fetch client-side del propio backend con cookies faltantes (mismo anti-patrón que el fix ZAL-588): la página es Server Component que llama directamente a `getAttentionBundle()` en DB; el endpoint `/api/...` existe para Mobile y para QA cross-equipo.

## Decisiones de diseño

### Endpoint compartido, no dos endpoints paralelos

Web y Mobile consumen el **mismo recurso** con `view=owner|coach`. No duplicamos el shape: si Mobile consume `getMyKpis()` y nosotros un `getAttentionBundle()`, Mobile queda divergente. Mantener un único endpoint con `view` reduce la deriva y cumple AC-11 del contrato.

### "Sin datos" como estado válido, no `?? 0`

`getAttentionBundle()` distingue dos casos:

- **Source devuelve 0 con query real** → `{ present: false, sourceAvailable: true, count: 0, label: "Sin cargos vencidos" }`.
- **Source no aplica al rol (coach no ve cobros)** → la propiedad se omite del payload (no se manda `count: 0` que el cliente interpretaría como "no tiene").

Esto cumple ZAL-619 §3.2: "si el dato no existe, se muestra 'sin datos' y no cero inventado".

### Acción prioritaria derivada server-side

`priorityAction` se calcula en el servidor a partir del bundle (no en cliente) para que Mobile y Web siempre coincidan. Reglas, en orden de prioridad:

1. **Cargos fallidos** (refund/payment_failed/chargebacks) → "Revisar cargos fallidos (N)" → `/app/[academyId]/billing?status=failed`
2. **Cargos vencidos** → "Cobrar cargos vencidos (N)" → `/app/[academyId]/billing?status=overdue`
3. **Asistencia pendiente** con sesión hoy en < 2 h → "Pasar lista de [clase] a las [hora]" → `/app/[academyId]/attendance/today/[sessionId]`
4. **Mensajes no leídos/enviados con error** → "Revisar mensajes fallidos (N)" → `/app/[academyId]/comms?status=failed`
5. **Progreso en borrador** (>0 drafts) → "Publicar evaluaciones pendientes (N)" → `/app/[academyId]/evaluations?status=draft`
6. **Import job en `failed` o `mapping_required`** → "Resolver import: [motivo]" → `/app/[academyId]/athletes/import?jobId=…`
7. **Sin fuente accionable** → `null`. La UI muestra "Sin acción prioritaria — todo en orden" sin claim cuantitativo.

Esto cumple ZAL-619 §3.2: "El owner ve una acción prioritaria y puede llegar al detalle en un recorrido corto".

### Aislamiento por `academyId` y por rol

- `withTenant` resuelve `tenantId` y `academyId` y los pasa al handler; el handler los **vuelve a comprobar** (no confía en el cliente).
- Coach recibe el subset read-only. Los endpoints de owner (`/api/.../dashboard/attention?view=owner`) requieren `membership.role ∈ {owner, admin}` o `academies.ownerId === profile.id`; coach recibe 403 limpio con `code: FORBIDDEN_ROLE`.
- Super_admin puede ver owner; esto no es un riesgo porque la lectura está scopada al `academyId` validado en la request.
- El payload **nunca** incluye academyId de otra academia, email de contacto, ni datos PII ajenos. Solo IDs y conteos. Las listas (`overdueCharges`, `pendingMessages`) limitan a 5 elementos y exponen solo `id` + `displayName` (no email, no teléfono).

### Estados de error tipificados

| Código | Cuándo | UI | nextAction |
|---|---|---|---|
| `ACADEMY_NOT_FOUND` | academyId sin match | Empty + "Academia no encontrada" | Volver al listado de academias |
| `FORBIDDEN_ROLE` | rol sin permiso (coach pide owner) | Empty + "No tienes acceso a esta vista" | Volver al dashboard del coach |
| `PARTIAL_SOURCE_FAILED` | una fuente falló pero el resto OK | Banner amarillo arriba + bundle parcial | Reintentar carga |
| `SOURCE_UNAVAILABLE` | DB caída o timeout | Error boundary + "No pudimos cargar el panel" | Reintentar / Soporte |
| `IDEMPOTENCY_CONFLICT` | reservado (mutación futura) | n/a | n/a |

`meta.requestId` y `meta.academyId` siempre presentes en respuestas exitosas y de error.

### Cobertura a11y mínima

- Landmarks `<main>` + `<nav>` correctos.
- Heading levels secuenciales: `h1` (título academia) → `h2` (cada bloque).
- Cada bloque del owner es un `<section aria-labelledby="…">` con un heading descriptivo.
- Los enlaces a detalle tienen `aria-label` que incluye la métrica ("Ir a 3 cargos vencidos" en lugar de "Ir a billing").
- Foco visible, contraste AA (criterio heredado de ZAL-604), `prefers-reduced-motion` respetado en las animaciones de la cuenta regresiva.
- Skip-link "Saltar al contenido" en la página (ya hay patrón `DashboardSkipLink.tsx`).
- Lista legible con `aria-live="polite"` cuando hay recuentos que cambian.

## Archivos a crear / tocar

### Nuevos

| Archivo | Propósito |
|---|---|
| `src/lib/dashboard/attention-bundle.ts` | Lógica pura de agregación, formateo y prioridad. Funciones exportadas: `getAttentionBundle`, `getCoachAttentionBundle`, `derivePriorityAction`. Testeable sin DB. |
| `src/lib/dashboard/attention-bundle.test.ts` | Tests unitarios de la lógica (sin DB). Cubre casos vacío, mixto, fallo parcial, rol coach, rol owner. |
| `src/app/api/app/[academyId]/dashboard/attention/route.ts` | Endpoint `GET` con `withTenant` + Zod + `apiSuccess`/`apiError`. Soporta `view=owner|coach` y `date` opcional. |
| `src/app/app/[academyId]/dashboard/at-a-glance/page.tsx` | Server Component que renderiza la página del dueño. |
| `src/app/app/[academyId]/dashboard/at-a-glance/loading.tsx` | Skeleton específico. |
| `src/app/app/[academyId]/dashboard/at-a-glance/error.tsx` | Boundary local que preserva `academyId` en URL y permite reintento. |
| `src/app/app/[academyId]/coach/today-simple/page.tsx` | Server Component que renderiza la página del coach. |
| `src/app/app/[academyId]/coach/today-simple/loading.tsx` | Skeleton. |
| `src/app/app/[academyId]/coach/today-simple/error.tsx` | Boundary local. |
| `src/components/dashboard/OwnerAttentionPanel.tsx` | Renderiza el bundle del owner con `AttentionBlock` por métrica y `PriorityAction` destacado. Client Component (botón "Reintentar", pull-to-refresh, navigator online). |
| `src/components/dashboard/CoachSimplePanel.tsx` | Renderiza el subset del coach (hoy + asistencia + próxima clase). |
| `src/components/dashboard/AttentionBlock.tsx` | Server Component compartido (título, valor/empty, href, fuente trazable). |
| `src/components/dashboard/PriorityAction.tsx` | Server Component con la acción prioritaria y un CTA. |
| `tests/e2e-zal-624-at-a-glance.spec.ts` | Spec Playwright: axe WCAG 2.2 AA en `/at-a-glance` y `/coach/today-simple`, responsive 3 viewports, teclado (3 secuencias de Tab), estados `empty`/`error` con mock. |

### Modificados

- `src/lib/authz/route-permissions.ts` — añadir `GET /api/app/[academyId]/dashboard/attention` con permiso `dashboard:read` (mapping explícito; sin esto, el wrapper devolvería 403 con `PERMISSION_CONTEXT_MISSING` o similar). Si no existe el permiso en el enum, abrir sub-issue a Engineering Lead en lugar de añadirlo silenciosamente.

### NO modificados (acotado por la issue)

- `src/lib/dashboard.ts` (vanity board) — sigue alimentando `/app/[academyId]/dashboard` legacy.
- `src/components/dashboard/DashboardPage.tsx` — sin cambios.
- `src/app/(super-admin)/super-admin/dashboard/*` — sin cambios (ZAL-590 ya cerrado).
- `src/lib/authz.ts` — sin cambios.
- `src/lib/api-response.ts` — sin cambios.

## Contrato API publicado

### `GET /api/app/[academyId]/dashboard/attention`

**Query params** (validados con Zod):

```ts
const AttentionQuerySchema = z.object({
  view: z.enum(["owner", "coach"]).default("owner"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // ISO date (YYYY-MM-DD)
});
```

**Headers**: requiere `Authorization` (cookie o bearer); `withTenant` los maneja.

**Auth**: `withTenant`; además:

- `view=owner` → membership.role ∈ {owner, admin} o `academies.ownerId === profile.id`; si no, `403 FORBIDDEN_ROLE`.
- `view=coach` → membership.role ∈ {owner, admin, coach}; si no, `403 FORBIDDEN_ROLE`.

**Response 200 (owner, ejemplo con datos)**:

```json
{
  "ok": true,
  "data": {
    "academyId": "…",
    "date": "2026-08-12",
    "today": [
      { "sessionId": "…", "className": "Iniciación 1", "startsAt": "2026-08-12T17:00:00Z", "groupName": "Pre-benjamín", "attendanceRecorded": false, "href": "/app/…/attendance/today/…" }
    ],
    "attendancePending": {
      "count": 1,
      "href": "/app/…/attendance?status=pending",
      "source": "attendance_records.status='pending' AND class_sessions.sessionDate=today"
    },
    "messagesPending": {
      "unsent": 0,
      "failed": 1,
      "unread": 3,
      "href": "/app/…/comms?status=failed",
      "source": "communications.status IN ('failed','read')"
    },
    "chargesOverdue": {
      "overdue": 2,
      "failed": 0,
      "items": [
        { "id": "…", "displayName": "Cuota julio — Marta R.", "amountCents": 4500, "currency": "EUR", "dueDate": "2026-08-01", "status": "overdue" }
      ],
      "href": "/app/…/billing?status=overdue",
      "source": "charges.status='overdue'"
    },
    "progressDrafts": {
      "count": 0,
      "href": "/app/…/evaluations?status=draft",
      "source": "athlete_assessments.status='draft'"
    },
    "importActive": null,
    "priorityAction": {
      "kind": "review_overdue_charges",
      "label": "Cobrar cargos vencidos (2)",
      "href": "/app/…/billing?status=overdue",
      "source": "charges.status='overdue'"
    }
  },
  "meta": { "requestId": "req_…", "academyId": "…" }
}
```

**Response 200 (owner, sin datos)**:

```json
{
  "ok": true,
  "data": {
    "academyId": "…",
    "date": "2026-08-12",
    "today": [],
    "attendancePending": { "count": 0, "sourceAvailable": true, "source": "…", "href": null },
    "messagesPending": { "unsent": 0, "failed": 0, "unread": 0, "sourceAvailable": true, "source": "…", "href": null },
    "chargesOverdue": { "overdue": 0, "failed": 0, "items": [], "sourceAvailable": true, "source": "…", "href": null },
    "progressDrafts": { "count": 0, "sourceAvailable": true, "source": "…", "href": null },
    "importActive": null,
    "priorityAction": null
  },
  "meta": { "requestId": "req_…", "academyId": "…" }
}
```

Notas:

- Cuando una fuente falla al consultar, su bloque expone `sourceAvailable: false` y `count` se omite; el handler **no** aborta el resto del bundle.
- Cuando `view=coach`, los bloques `chargesOverdue` e `importActive` **se omiten** del payload (no se envían campos con `null` ni `0` que inviten a interpretación).
- `items[]` siempre máximo 5 entradas. Si hay más, el cliente puede profundizar vía `href`.

**Errores**: `401 UNAUTHENTICATED`, `403 FORBIDDEN_ROLE`, `404 ACADEMY_NOT_FOUND`, `400 VALIDATION_ERROR`, `500 INTERNAL_ERROR`, `429 RATE_LIMITED`. Mensaje en español, código del contrato ZAL-619 §6.3.

## Riesgos y follow-up

- **iCloud dataless** puede materializar archivos como vacíos durante el typecheck. Si el repo entra en este estado, el plan B es documentar el gap y etiquetar `L` puro sin `T` corrido.
- **`dashboard:read`** permission: si el enum no la incluye, **no se añade silenciosamente**; se abre child issue a Engineering Lead (no es alcance de ZAL-624).
- **Web-vitals / `error.tsx` por ruta P0**: hallazgos de ZAL-621 §1–2, no se cierran en este heartbeat.
- **Búsqueda como command palette vs ruta dedicada**: hallazgo de ZAL-621 §2.3, decisión de producto pendiente. No se toca en este work product.
- **Carga de queries**: el bundle hace 5–6 queries paralelas con `Promise.all`; debe estar bajo 200 ms en sandbox con academia sintética. No publicamos p50/p95 sin `N≥10` por entorno (regla ZAL-619 AC-5).
- **Mobile consume el mismo endpoint**: el cliente Mobile debe añadir `getAttention(academyId, view)` a `mobile/lib/api/endpoints.ts` y `mobile/lib/api/endpoints.test.ts`. ZAL-622 cubre paridad; este work product solo garantiza el contrato.

## Verificación y evidencia

### Local (este heartbeat)

- `pnpm exec vitest run src/lib/dashboard/attention-bundle.test.ts` — tests unitarios sin DB.
- `pnpm exec vitest run src/lib/api-response*` y `src/lib/authz*` — para no romper contratos existentes.
- `pnpm typecheck` y `pnpm lint`: si fallan por iCloud dataless (gap conocido), se documenta en el comentario de la issue y se etiqueta evidencia `L` parcial.
- Inspección estática: `grep -n 'dashboard:read' src/lib/authz/route-permissions.ts` para confirmar que la ruta queda registrada.

### Sandbox / test (siguiente heartbeat, fuera de ZAL-624)

- Levantar academia sintética con 2 academias; comprobar aislamiento (0 cruces).
- Disparar 50 requests contra `/api/app/.../attention` y medir p50/p95 con `performance.now` server-side.
- Spec Playwright `tests/e2e-zal-624-at-a-glance.spec.ts` corre con `E2E_ACADEMY_ID` + `E2E_STORAGE_STATE` reales.

### Humana (siguiente sprint, fuera de ZAL-624)

- Owner real abre `/at-a-glance` y completa la secuencia diaria.
- Coach real abre `/coach/today-simple` y completa la secuencia de clase.
- QA ejecuta la matriz AC-02 con los 14 códigos de error del contrato.

## Límites respetados (per ZAL-624 description y AGENTS.md)

- Sin copy, permisos nuevos sin notificar, auth diferente, datos reales, migraciones, secretos, producción, Stripe live, pricing, claims, campañas, publicaciones ni stores.
- Solo se añade un permiso (`dashboard:read`) si ya existe en el enum. Si no, child issue.
- No se reabre ZAL-590 (super-admin), ZAL-477 (piloto), ZAL-501 (Mobile legacy), ZAL-587 (super-admin fases), ZAL-588 (gate fix), ZAL-621 (a11y/perf) ni ZAL-630 (UX).
- Cambios en vault: este archivo + entrada en `Changelog interno.md` (sin claims).
