---
status: active
owner: producto
last_reviewed: 2026-08-10
source:
  - ../ROADMAP.md
  - ../AGENTS.md
---

# Changelog interno

## 2026-08-10 - ZAL-497 [Web] Estados de error del recorrido provider: catálogo, acciones y copy engañoso (PV-4, PV-5, PV-6, PV-7)

Cierra los 4 hallazgos P1 del audit [ZAL-427](/ZAL/issues/ZAL-427) §2 sobre el recorrido del `provider`. Van juntos porque son el mismo tejido: el proveedor no podía distinguir qué falló ni si su acción tuvo efecto.

**Cambios:**

- **PV-5 — `src/app/dashboard/marketplace/mis-productos/page.tsx`** — estado distinguible loading / ready / error (con `LoadState` discriminated union). Antes `setListings([])` se ejecutaba en cualquier `!res.ok` y caía al empty state con copy "Aún no tienes productos publicados", que mentía al proveedor con 20 anuncios tras un 401. Ahora 401 → tarjeta "Tu sesión ha caducado" con CTA `/login`; 5xx / red → `ErrorState` con reintento (`onRetry={fetchListings}`); ready con `listings.length === 0` → empty state real con icono `Inbox` y copy "Cuando publiques tu primer anuncio aparecerá aquí".
- **PV-7 — `src/app/dashboard/marketplace/mis-productos/page.tsx`** — feedback de fallo en toggle y delete. Antes `handleStatusToggle`/`handleDelete` solo mostraban toast en `catch` (red), nunca en 4xx/5xx: el proveedor creía que había pausado un anuncio que seguía activo. Ahora cualquier respuesta no-2xx mapea a `copyForToggleError`/`copyForDeleteError` (401 → sesión caducada; 403 → sin permisos con CTA contacto; 404 → anuncio ya no existe; resto → "vuelve a intentarlo"). `confirm()` nativo reemplazado por `ConfirmDialog` del sistema de diseño (`variant="destructive"`).
- **PV-4 — `src/components/marketplace/MarketplaceForm.tsx` + `src/app/api/marketplace/route.ts`** — copy accionable por tipo de error. Antes `error.message || "Revisa los datos e inténtalo de nuevo"` y el 403 `TENANT_MISSING` llegaba sin `message` desde `authz.ts:278`, así que un fallo de permisos se mostraba como error de datos. Ahora `copyForPublishError(status, body)` mapea por status: 401 → "Tu sesión ha caducado"; 403 → "Tu cuenta de proveedor todavía no puede publicar. Escríbenos y lo activamos." con enlace `/contacto`; 400/VALIDATION_ERROR → "Faltan datos en el formulario" + errores anclados al campo (`<p role="alert">` bajo cada input, `aria-invalid` en el `SelectTrigger`/`Input`, `border-red-500`); servidor → "Vuelve a intentarlo en unos segundos". El banner de error a nivel formulario usa `role="alert"` y variantes `error`/`warning`. La API devuelve `details.field` y `details.issues[]` del primer ZodError para que el cliente pueda anclar.
- **PV-6 — `src/app/api/marketplace/route.ts:58-99`** — `ContactSchema` con `z.refine` exige al menos un canal de contacto (whatsapp/email/phone no vacíos); el schema raíz además exige `contact` presente. Antes los tres eran opcionales y `priceType` por defecto era `contact` → "A convenir" sin forma de convenir. El form cliente valida con `validateClient()` y muestra "Necesitamos al menos una forma de que te contacten." bajo los tres inputs y en toast cuando es el único error.

**Tests:**

- `tests/api-marketplace.test.ts` — 4 tests nuevos (PV-4, PV-6): rechaza sin `contact` (400 + código), rechaza con tres canales vacíos, acepta solo-whatsapp, acepta solo-phone, `details.field` apunta a `title` cuando el título es corto. Total **15/15 PASS** (`vitest run tests/api-marketplace.test.ts`).
- Regresión cruzada: `tests/ui-select-options.test.tsx` (6/6) y `tests/components-critical.test.tsx` (10/10) siguen verdes — el fix PV-5/PV-7 no toca el `<select>` que arregló ZAL-494.

**Verificación local:**

- `pnpm typecheck` — sin errores nuevos en mis archivos; los errores pre-existentes en `mobile/` y `src/app/api/support/tickets/[id]/responses/route.ts` quedan fuera de scope (consistente con notas previas del changelog).
- `pnpm lint` (lint:app sobre `src/`) — limpio.
- No se levantaron servidores Next.js locales; el puerto 3100 disponible correspondía al control plane de Paperclip, no a Zaltyko. La verificación funcional se apoyó en vitest.

**Fuera de scope:** PV-2 (403 TENANT_MISSING por `withTenant`) lo cerró ZAL-499/ZAL-495 con `withAuthenticatedNoTenant`. PV-8 (router.push fallback) sigue intacto. El recorrido end-to-end del `provider` ahora puede completarse hasta el formulario, pero **el 403 sigue apareciendo** hasta que un admin active el flag de proveedor — el copy nuevo lo explica al usuario en lugar de mentirle.

No se tocaron pricing, RLS, migraciones, secretos, producción ni publicación.

## 2026-08-10 - ZAL-499 [API] wrapper `withAuthenticatedNoTenant` aplicado a POST /api/marketplace (PV-2 / ZAL-495)

Cierra la opción **(a)** aprobada por el board en [ZAL-495](/ZAL/issues/ZAL-495): tratar `POST /api/marketplace` como endpoint autenticado sin tenant, conservando `userId` server-derived. La contradicción detectada era que el rol `provider` se diseñó como global sin academia/tenant (`src/lib/product/roles.ts:76-82`), pero el endpoint exigía `tenantId` válido (`withTenant` → 403 `TENANT_MISSING`).

Cambios mínimos (5 controles, todos reversibles localmente, sin schema, sin migraciones, sin secretos):

- **C-1** — `src/lib/authz/endpoint-config.ts`: nueva categoría `authenticatedNoTenantEndpoints` y helper `isAuthenticatedNoTenantEndpoint(pathname, method)` (solo POST, inicializado con `['/api/marketplace']`). No se añadió a `flexibleTenantEndpoints` (la advertencia de `endpoint-config.ts:4-7` aplica).
- **C-2** — `src/lib/authz.ts`: nuevo wrapper `withAuthenticatedNoTenant<Ctx>(handler)` que resuelve `userId`/`profile`, exige `canLogin` (super_admin pasa siempre), y permite rol `super_admin`, `provider`, o cualquier perfil con `tenantId`; el resto → 403 `INSUFFICIENT_ROLE`. NO llama a `getTenantId`/`resolveTenantWithUpdate`/`extractVerifiedAcademyCandidate`/`enforceVerifiedTenantMutationRateLimit`. Preserva la firma `TenantContext` con `tenantId: ''`. Mismo patrón de manejo de errores que `withTenant`.
- **C-3** — `src/app/api/marketplace/route.ts:8,134`: `import` y export `POST` cambian de `withTenant` a `withAuthenticatedNoTenant`. GET queda público, sin cambios. Validación interna cambia de `if (!context.tenantId)` a `if (!context.userId)` (el wrapper garantiza lo segundo).
- **C-4** — `grep -n 'userId' src/app/api/marketplace/route.ts` confirma una sola asignación al campo `userId` del insert (`route.ts:151`) desde `context.userId` (`route.ts:147`). Sin `validated.userId`. Sin IDOR.
- **C-5** — `vault/06-Roadmap-y-Tareas/Decisiones.md` ADR 'ZAL-495: POST /api/marketplace sin tenant, propiedad por userId' añadido en cabeza del archivo con formato tabla Contexto/Decisión/Consecuencia/Estado.

Tests:
- `tests/authz-with-authenticated-no-tenant.test.ts` (nuevo, 8 tests): G-1 (provider body válido), G-3 (owner con tenant), N-1 (athlete sin tenant 403), N-2 (parent sin tenant 403), N-3 (sin sesión 401), anti-login-disabled (provider con `canLogin=false`), super-admin login gate (pasa con `canLogin=false`), N-5 anti-IDOR (`userId` del body no se filtra).
- `tests/api-marketplace.test.ts`: mock actualizado a `withAuthenticatedNoTenant`; los 10 tests previos siguen verdes.
- Cobertura focal: 18/18 tests pasan en `pnpm vitest run tests/authz-with-authenticated-no-tenant.test.ts tests/api-marketplace.test.ts`. Las 7 suites `authz-*` siguen verdes (106/106).

Verificación local: `pnpm typecheck` no introduce errores nuevos en `src/lib/authz*` ni en `src/app/api/marketplace/route.ts` (los errores pre-existentes en `mobile/` y `src/app/api/support/tickets/[id]/responses/route.ts` no están en el scope del fix).

Riesgos residuales / P1 derivados (no abiertos aquí, ver ADR): permission gate `marketplace:write` en `route-permissions.ts`; validación `sellerType` contra rol; PV-1/PV-4..PV-13 del audit [ZAL-427](/ZAL/issues/ZAL-427).

Vault: actualizadas `Decisiones.md` y `Changelog interno.md`. Cierre de [ZAL-499](/ZAL/issues/ZAL-499) queda sujeto a PR con los 5 controles y confirmación de cobertura negativa por QA.

## 2026-08-10 - [ZAL-491] alerta presupuestaria cerrada sin aumento de cap

Se cerró la alerta ejecutiva después de que el board rechazara el approval [40b0a074-3c83-47fb-89d6-d9f16d1a183b](/ZAL/approvals/40b0a074-3c83-47fb-89d6-d9f16d1a183b). No se reintentó la solicitud ni se interpretó el rechazo como autorización de gasto.

- `/costs/summary` en este heartbeat: 432278/1000000 centavos (43,23%) del presupuesto configurado.
- El cap operativo histórico de 1000 USD sigue siendo la restricción ejecutiva: no se aumenta, no se contratan agentes y no se reactivan reintentos de bajo valor.
- La causa `provider_quota` y el failover/circuit-breaker siguen con Engineering/Platform.
- La alerta queda separada de la evidencia de producto; el piloto [ZAL-477](/ZAL/issues/ZAL-477) conserva sus blockers reales y no se declara adopción, readiness ni conversión.

Vault: actualizadas `Decisiones.md` y `Changelog interno.md`. No se actualizó `Backlog priorizado.md`: no apareció un riesgo nuevo, solo se consolidó una restricción ya vigente.

## 2026-08-10 - ZAL-496 [Web] marketplace: `userId`/`sellerType` salen del schema y se derivan server-side

Hallazgo **PV-3 (P0)** del recorrido `provider` auditado en `vault/03-Negocio/RESEARCH/ZAL-427 auditoria UX recorrido provider 2026-08-10.md` §2 (SHA `a784a0ca2`). `CreateMarketplaceSchema` exigía `userId: z.string().uuid()` (`src/app/api/marketplace/route.ts:16`) y `sellerType` con default `"external"`; `MarketplaceForm` los recibía por props (`MarketplaceForm.tsx:34`), pero `/marketplace/nuevo/page.tsx:14` monta el form **sin props**. Resultado: `userId: undefined` → `ZodError` → `400 VALIDATION_ERROR` en cada intento de publicar, y `sellerType` se persistía como `"external"` aunque el autor fuese una academia, un coach o un proveedor registrado. El handler ya insertaba `userId: context.userId` sin usar el valor validado, así que el campo era un obstáculo puro.

**Decisión técnica (mínima, no refactor):** sacar `userId` y `sellerType` del schema y derivarlos en el servidor. `userId` es la sesión (no se acepta valor del cliente → anti-IDOR). `sellerType` sale del rol del perfil via `sellerTypeForRole(role)`: `admin`/`owner` → `academy`, `coach` → `coach`, `athlete` → `athlete`, `provider` → `provider`, `super_admin`/`parent` → `external`. La columna `marketplace_listings.sellerType` es `text` en DB, así que añadir `"provider"` no exige migración; actualizo el comentario del schema para reflejar el contrato actual.

**Cambios:**

- `src/app/api/marketplace/route.ts` — `CreateMarketplaceSchema` sin `userId`/`sellerType`; nueva helper `sellerTypeForRole(role)` única responsable de la asignación; inserta `userId = context.userId` y `sellerType = sellerTypeForRole(context.profile?.role)`. Si el cliente envía esos campos, el servidor los ignora.
- `src/components/marketplace/MarketplaceForm.tsx` — `MarketplaceFormProps` solo conserva `onSuccess`; `userId`/`sellerType` se retiran del body enviado a la API. `onSuccess` sin props → fallback `router.push("/marketplace")` se mantiene (PV-8 queda intacto y fuera de scope).
- `src/db/schema/marketplace.ts` — comentario `sellerType` ampliado a `academy, coach, athlete, provider, external`.
- `tests/api-marketplace.test.ts` — nuevo, 10 tests PASS: POST sin `userId`/`sellerType` devuelve 201; `userId`mpostor y `sellerType`mpostor del body se ignoran; mapping rol→sellerType verificado para `provider`, `owner`, `admin`, `coach`, `athlete`, `parent`; payload incompleto sigue devolviendo 400.
- `vault/06-Roadmap-y-Tareas/Backlog priorizado.md` — entrada resuelta 2026-08-10 en P0.

**Evidencia de verificación:**

- `pnpm test tests/api-marketplace.test.ts --run` → 10/10 PASS.
- `pnpm test tests/ui-select-options.test.tsx --run` → 6/6 PASS (no regresión del fix PV-1/ZAL-494).
- `pnpm lint` → limpio.
- `pnpm typecheck` → sin nuevos errores; los preexistentes siguen en `mobile/` (RN 0.86) y `src/app/api/support/tickets/[id]/responses/route.ts` (FormData), no relacionados.

**Mejora de seguridad colateral:** el cambio cierra de raíz el IDOR `userId` que el schema tenía latente (validaba un campo que el handler ignoraba, así que un cliente podría haber enviado cualquier UUID antes de la sesión actual y la validación habría pasado — pero el `insert` usaba `context.userId`, no `validated.userId`, así que en la práctica nunca publicó en nombre de otro. Quitar el campo del schema elimina la confusión entre contrato y realidad).

**Pendiente para abordar en otro ticket (no resuelta por ZAL-496):**

- **PV-2 del mismo audit**: `POST /api/marketplace` sigue en `withTenant`, por lo que un `provider` recibe `403 TENANT_MISSING` por diseño de rol. El recorrido del proveedor no podrá completarse en navegador hasta que Backend/Security decida entre (a) añadir `/api/marketplace` a `isFlexibleTenantEndpoint` con validación explícita de `userId` en el handler, o (b) dar tenant propio al `provider`. Owner sugerido en la auditoría: Backend / Security.
- **PV-4, PV-5, PV-7, PV-8, PV-9, PV-10, PV-11, PV-12, PV-13** siguen abiertos en la auditoría ZAL-427 como P1/P2/P3.

No se tocaron pricing, RLS, migraciones, secretos, producción ni publicación.

## 2026-08-10 - ZAL-494 [UI] ui/select no expone opciones: desplegables pintan vacíos

Hallazgo **PV-1 (P0)** del recorrido `provider` auditado en `vault/03-Negocio/RESEARCH/ZAL-427 auditoria UX recorrido provider 2026-08-10.md` §2 (SHA `a784a0ca2`). `src/components/ui/select.tsx` envolvía los `<SelectTrigger>` y `<SelectContent>` en `<div>`s, así que los `<option>` no eran hijos directos del `<select>`; `HTMLSelectElement.options` los ignoraba y el proveedor no podía elegir Categoría en `MarketplaceForm` ni Prioridad/Categoría en `AnnouncementForm`. Mismo componente aceptaba `id` en `<SelectTrigger>`, dejando huérfanos los `<Label htmlFor>` (PV-11, WCAG 1.3.1 y 4.1.2).

**Decisión técnica (mínima, sin reemplazar el wrapper por un listbox accesible):** mantener la API pública (`Select`/`SelectTrigger`/`SelectContent`/`SelectValue`/`SelectItem`) y proyectar los `<option>` como hijos directos del `<select>`. `Select` aplana los hijos en `React.Children.forEach`: si encuentra un `<SelectTrigger>` extrae `className`/`id` y los aplica al `<select>` real (PV-11), y reemplaza el nodo por sus hijos; los demás hijos (incluido `<SelectContent>`, ahora Fragment) se conservan. `SelectItem` deja de fijar `selected` (React 18+ avisa y el `<select>` controlado ya marca el match). `SelectValue` pasa a Fragment para silenciar `validateDOMNesting` por `<span>` dentro de `<select>`.

**Cambios:**

- `src/components/ui/select.tsx` — reescrito: flatten de `SelectTrigger`, `SelectContent` y `SelectValue` ahora Fragments/`null`, `id` y `className` se aplican al `<select>` real.
- 7 callers actualizados para mover `id` de `<SelectTrigger>` a `<Select>` (consumidores con `<Label htmlFor>`): `AnnouncementForm.tsx` (2), `AttendanceReport.tsx` (3), `ProgressReport.tsx` (1), `DocumentUploadModal.tsx` (1).
- `tests/ui-select-options.test.tsx` — 6 tests verdes (jsdom + @testing-library/react): opciones como hijos directos del `<select>`, lista larga tipo MarketplaceForm (11 categorías), selección por teclado vía `userEvent.selectOptions`, id pasado por `<Select>`, id heredado de `<SelectTrigger>` para compat, y asociación `<Label htmlFor>` → `<select>` real.
- Lint y typecheck de los 5 ficheros tocados limpios. Errores preexistentes en `mobile/` (RN 0.86 casing/types) y `src/app/api/support/tickets/[id]/responses/route.ts` (FormData) no relacionados; no se tocaron.

**Evidencia de verificación:**

- `pnpm test tests/ui-select-options.test.tsx tests/components-critical.test.tsx` → 16/16 PASS.
- Sonda `expect(container.querySelector("select").options.length).toBe(2)` que fallaba en `a784a0ca2` ahora pasa.
- `<Label htmlFor="category">Categoría</Label>` resuelve a `screen.getByLabelText("Categoría")` (era el `<div>` anterior, ahora apunta al `<select>` real).

**Radio vivo:** 28 archivos importaban `SelectTrigger`; los 7 con `id` se migraron en este cambio. Los ~20 con `className` (anchos `w-[Xpx]`) siguen funcionando: `Select` reenvía `triggerClassName` al `<select>`, así que la apariencia no se pierde. No se tocó pricing, RLS, migraciones, secretos, producción ni publicación.

**Pendiente para QA:** validar visualmente que ningún desplegable del producto perdió su tamaño (sólo los `<SelectTrigger className="w-[180px]">`-style siguen aplicando al `<select>` real, ahora `w-full` por defecto más el override). Sugerido: añadir a `tests/e2e-zaltyko-full.spec.ts` un flujo `MarketplaceForm` que rellene Categoría y confirme que el POST sale con `category` no vacío.

## 2026-08-09 - ZAL-481 piloto Web/Mobile: bloqueadores de tooling y dominio resueltos

Se revisó el recorrido mínimo de acceso, configuración de academia, primer registro operativo y trial Starter/billing con datos sintéticos/locales. El corte compatible queda deliberadamente separado: Web mantiene creación/configuración de academia, activación de trial y checkout/portal owner-only; Mobile usa los contratos backend existentes para login/perfil y operación diaria del coach (sesiones, asistencia y evaluación). Mobile no duplica lógica server-only ni ofrece billing SaaS administrativo en la app nativa.

**Bloqueadores reproducidos y resolución:**

- **Mobile no verificable por instalación incompleta:** `mobile/` no tenía dependencias instaladas; `tsc`, Vitest y ESLint fallaban antes de compilar (`expo/tsconfig.base` ausente y `--ext` inválido en ESLint 9). Se ejecutó `npm ci` local (sin modificar lockfile), se corrigieron `lint`/`lint:fix` al formato ESLint flat y el tooling quedó verde.
- **Mobile abría el alias antiguo:** el fallback y la plantilla `EXPO_PUBLIC_API_BASE_URL` apuntaban a `https://app.zaltyko.com`, mientras la URL canónica y universal links del proyecto son `https://zaltyko.com`. Se alinearon `mobile/lib/auth/supabase.ts` y `mobile/.env.example`; no se leyeron ni modificaron variables externas.
- **No bloqueador funcional descartado:** no se encontró un fallo reproducible en los contratos de claim de owner, creación/listado de sesiones, asistencia, autenticación/autorización, planes o trial. Los 43 tests Web focales pasan.

**Evidencia local/sandbox:**

- Mobile: `npm run typecheck` PASS; `npm test -- --run` PASS, 2 archivos/13 tests; `npm run lint` PASS; `npx expo export --platform web` PASS.
- Web/backend: Vitest focal PASS, 7 archivos/43 tests (`owner-claim`, auth completa, sesiones, asistencia, billing plans, trial lifecycle y billing integration).
- Web UI local: Playwright Chromium público PASS, 2/2 tests (`tests/e2e-zaltyko-public.spec.ts`), incluyendo sitemap/robots y formulario de contacto local.
- `npm audit --omit=dev` de Mobile sigue reportando 9 high/17 moderate transitorias en la cadena Expo/Metro. No se ejecutó `npm audit fix --force`: propone downgrade mayor de Expo y es riesgo de plataforma separado, no se mezcló con el bloqueador del piloto.

**Handoff:** release candidate local listo para revisión independiente de QA/Platform & Security. No se ejecutaron producción, migraciones remotas, Stripe live, secretos, datos reales ni publicación. Pendiente antes de cualquier build distribuido: confirmar que el pipeline de Mobile inyecte `EXPO_PUBLIC_API_BASE_URL=https://zaltyko.com` y realizar la validación humana de dispositivo; el código ya tiene fallback canónico.

Vault: actualizado `Changelog interno.md`; sin cambio de dirección de producto ni migración.

## 2026-08-09 - ZAL-462 auditoría operativa CEO y limpieza de gates fantasma

Se revisó el flujo de trabajo completo contra Paperclip, la vault y el estado de git, manteniendo cambios paralelos sin revertir.

**Evidencia actual de operación:**

- Paperclip: 99 issues abiertas (`60 blocked`, `27 in_review`, `2 in_progress`, `1 todo`, `9 backlog`).
- Costes: `/costs/summary` devuelve `407699` centavos sobre cap `1000000` (`40,77%`). El dato `167,97%` de la auditoría del 2026-08-04 queda etiquetado como snapshot histórico de la aprobación `3a992918-ddcb-487a-8dfb-fcd8772f57fd`; no se elevó un nuevo approval porque el gasto actual está bajo 80%.
- La rama local `zal-45-gate-disponibilidad-pais` está 8 commits por delante de `origin`; existen cambios ajenos sin commit en la vault y se conservaron.
- La señal de balance por texto de issues sigue siendo mala: 77 issues contienen lenguaje de control/gobernanza frente a 63 con lenguaje de producto. Es una heurística de triage, no evidencia de adopción ni readiness.

**Acciones ejecutadas:**

- [ZAL-156](/ZAL/issues/ZAL-156): se eliminó la dependencia fantasma de Gemita, se pasó a `todo` y se reasignó la aceptación funcional a Product Lead.
- [ZAL-158](/ZAL/issues/ZAL-158): se reemplazó el gate de privacidad de Hermin por Platform & Security y se pasó a `todo`.
- [ZAL-191](/ZAL/issues/ZAL-191): se eliminó la referencia operativa a Gemita y se pasó a `todo` para triage de Marketing.
- [ZAL-138](/ZAL/issues/ZAL-138) no se desbloqueó porque su bloqueo vigente es C-2 SHA real; [ZAL-140](/ZAL/issues/ZAL-140) ya estaba cerrada.

**Decisión operativa:** producto primero; `blocked` solo con dependencia real y acción nombrada; `in_review` solo con reviewer/interacción/monitor persistente; SHA + peer para código y cambios sensibles; sin no-op/C-2 repetitivo para docs, copy, briefs u operaciones no-code verificables. Los límites de producción, dinero real, datos personales, secretos y publicación externa no cambian.

**Vault:** actualizadas `Decisiones.md`, `Changelog interno.md` y `Backlog priorizado.md`.

## 2026-08-08 - ZAL-158 [GTM-DEP.2] corte 1 schema/RLS-only entregado, pendiente C-2

Corte 1 del split en 3 cortes aprobado por el board en [ZAL-441](/ZAL/issues/ZAL-441) (Strategy A + Plan B).

**Deliverable verificado:**

- SHA `de4dcd985c53de350b2ca0c988eb898dd4ca21f6` en rama `feat/zal-158-owner-consent-cut1`, 738 insertions, 5 archivos.
- `src/db/schema/owner-consent.ts` (Drizzle): `owner_consent` 1-fila-por-owner con soft-revoke + `owner_consent_audit` append-only con trigger `BEFORE UPDATE/DELETE` que lanza EXCEPTION. Constraints CHECK replican regex `^vN-YYYY-MM-DD$` (policy_version) y `<source>:<id 1-128>` (consent_proof).
- `supabase/migrations/20260808120000_owner_consent.sql`: companion SQL versionado con `app_config` + `current_policy_version()` (C1), RLS `owner_self_read` para ambas tablas (defense-in-depth per Decisiones 2026-07-09), `app_config` sembrado con `consent.policy_version = v1-2026-08-01`.
- `src/lib/consent/owner-consent.ts`: helper server-side puro (sin I/O). Predicate `isConsentGrantedAndActive(consent, currentPolicyVersion)` evaluado al momento (no cacheado, C2), regex/enums exportados (C3), helper `appendAuditEvent` (C4).
- `tests/owner-consent.test.ts`: 25/25 tests verdes (vitest). Cubre regex, predicate de gating, validación `consent_proof` ↔ `source`, edge case re-grant por policy bump.
- `pnpm drizzle-kit check` → Everything fine (schema ↔ migration consistente).
- 0 cambios de comportamiento runtime. Capa de wiring (`withTenant` API, captura en signup/claim, revocación) queda para corte 2.

**HMAC del API de revocación (Plan B aprobado en ZAL-441):** derivado de `NEXTAUTH_SECRET` con namespacing y validación de entropía mínima, reemplazado por secret dedicado en corte 2. No bloquea corte 1.

**Estado de cierre:** ZAL-158 sigue en `in_review` con C-1 anchored (board ya emitió `## Review: APPROVED` literal en ZAL-158 thread 2026-08-08T17:46:20Z, replicado por ZAL-441 a 17:45:41Z). PATCH `status=done` devuelve 409 `PeerVerificationRequired` per `feedback_paperclip_auto_approve_conditional.md` (C-1 vivo exige C-2). Comentario de evidencia + opciones (C-2 board directo / supersede C-1) en ZAL-158 (`e86a2ec3-9380-4133-8304-ed82e97cb3dc`) y ZAL-441 (`691952c9-cef9-494c-ae75-089c857570a6`).

**Acción siguiente:** decisión board entre C-2 directo o supersede C-1. Ningún PATCH que cierre la issue está agent-side.

**Refs:** PR #66 contra `zal-45-gate-disponibilidad-pais`; ZAL-160 (page_view consentido) queda habilitada para re-verificar el contrato read-only con storage real cuando ZAL-158 corte 1 cierre.

## 2026-08-04 - ZAL-289 contención operativa tras auditoría del board

Se convirtió la auditoría del board en trabajo ejecutable y se separó la evidencia de control-plane de cualquier claim de readiness de producto.

**Estado verificado en Paperclip:**

- Gasto mensual: `167966` centavos contra cap `100000` (167,97%).
- Cola: 57 issues bloqueadas y 43 en `in_review`.
- Platform & Security: 14 bloqueadas y gasto mensual `29997` centavos.
- Meta-trabajo: 33 de 41 canceladas actuales coinciden con peer/SHA/C-2/productivity/no-op.
- Fallos del 2026-08-04: 20; 13 por `provider_quota`. La auditoría histórica reporta 866 fallos de quota sobre 1096 fallos totales.

**Acciones ejecutadas:**

- Approval de board `3a992918-ddcb-487a-8dfb-fcd8772f57fd` para decidir contención/cap; recomendación: no subir el cap antes de diseñar failover y circuit-breaker.
- [ZAL-290](/ZAL/issues/ZAL-290): diseño de failover, backoff y alertas, owner Engineering Lead.
- [ZAL-291](/ZAL/issues/ZAL-291): simplificación del gate no-code y límite de tres ciclos, owner Engineering Lead.
- [ZAL-292](/ZAL/issues/ZAL-292): vaciado de `in_review` con owners y próximas acciones, owner Product Lead.
- [ZAL-293](/ZAL/issues/ZAL-293): redistribución completa de la cola de Platform & Security, owner Engineering Lead.
- Reasignadas a Engineering Lead [ZAL-248](/ZAL/issues/ZAL-248) y [ZAL-174](/ZAL/issues/ZAL-174); reasignadas a QA [ZAL-197](/ZAL/issues/ZAL-197) y [ZAL-220](/ZAL/issues/ZAL-220). Todas pasaron de `blocked` a `todo` porque son trabajo local/reproducible sin secretos.

**Límites:**

- No se ejecutaron cambios de producción, migraciones remotas, secretos, cuentas externas, compras ni cambios de proveedor.
- Las cifras son evidencia del control-plane, no validación externa, adopción ni readiness de Zaltyko.

**Vault:** actualizadas `Decisiones.md`, `Changelog interno.md` y `Backlog priorizado.md`.

## 2026-08-02 - ZAL-3 [Stripe Connect] la notificación de cobro fallido es best-effort

Se endureció `reconcilePaymentIntentFailed(...)` para que un fallo al enviar la notificación al tutor no tumbe el webhook ni revierta la reconciliación del cargo. El cargo sigue quedando en `failed`, el error se registra con `logger.error` y el webhook de Connect conserva el contrato idempotente.

**Cambios concretos:**

- `src/lib/stripe/charge-reconcile-service.ts` ahora envuelve `sendChargePaymentFailedNotification(...)` en `try/catch`.
- `tests/lib/stripe-charge-collection.integration.test.ts` añade un caso negativo: si la notificación falla, la reconciliación sigue resolviendo en `undefined` y el update del cargo se conserva.

**Verificación:**

- Ejecutado `corepack pnpm vitest run tests/lib/stripe-charge-collection.integration.test.ts tests/connect-webhook-payment-failed-notification.test.ts tests/lib/stripe-connect-webhook-handler.test.ts`.
- Resultado: 30/30 tests verdes.

**Vault:** actualizado. Sin cambios adicionales en `Decisiones`.

## 2026-08-02 - ZAL-3 [Stripe Connect] notificación de cobro fallido al tutor/familia

Se añadió la notificación operativa para `payment_intent.payment_failed` en el reconciliador de Stripe Connect: cuando un `PaymentIntent` falla y sigue asociado a un cargo pendiente/failed de la misma academia/tenant, el webhook ahora deriva `chargeId`, `tenantId`, `academyId`, `athleteId`, importe y motivo de fallo hacia un email transaccional con logging y dedupe por `chargeId + paymentIntentId`.

**Cambios concretos:**

- `src/lib/stripe/charge-reconcile-service.ts` llama a `sendChargePaymentFailedNotification(...)` tras marcar el cargo como `failed`.
- `src/lib/stripe/notification-service.ts` resuelve el destinatario desde `guardians` o `familyContacts`, protege el render del subject/cuerpo si falta `academyName` y usa `sendEmailWithLogging` para conservar trazabilidad.
- `tests/connect-webhook-payment-failed-notification.test.ts` ya cubría el flujo; se verificó el helper contra esa suite sin cambiar el contrato.
- `tests/e2e-zaltyko-stripe-connect-flow.spec.ts` mantiene el ajuste para cargar Stripe.js desde un origen web real antes de confirmar el SetupIntent.

**Verificación:**

- Ejecutado `corepack pnpm vitest run tests/connect-webhook-payment-failed-notification.test.ts`.
- Resultado: 9/9 tests verdes.

**Vault:** actualizado. Sin cambios adicionales en `Decisiones`.

## 2026-08-02 - ZAL-158 [GTM-DEP.2] Consent gate tracking — disposition `blocked` (compliance gate)

Run `e791afbb-1a8a-4113-aa5c-65713e6e80b8` terminó `failed` por cuota (429 del modelo, no bug técnico). Inspección: el run no produjo código (no hay SHAs nuevos para `owner_consent` ni cambios en disco). Levanto el trabajo en este heartbeat (`5b186b1c-ccc3-486c-8619-34e9ff11771e`) pero **no escribo código**: la propia issue ZAL-158 declara a Hermin (Data Protection) como BLOQUEANTE para instrumentar (§6 de `RESEARCH/DATA_GOVERNANCE_TAXONOMY_GTM.md`).

**Disposition registrada:** ZAL-158 → `blocked`.

**Unblock descriptor:**

- `owner: "board"` — el board debe activar a Hermin para ejecutar privacy review sobre los campos propuestos de `owner_consent` y coordinar con Content (5d63f5f6) para empujar ZAL-139 a `done`.
- `blockedByIssueIds: ["ce0c2713-a772-49d5-b07d-2a145826a72a"]` — ZAL-139 Resend templates. Cuando cierre, el email gating copy queda liberado.

**Por qué NO se instrumentó nada (regla Web Developer "cambios sensibles sin QA y Platform/Security"):**

- `owner_consent` schema (Drizzle) + migración: si Hermin pide campos distintos, retroceder migración es caro. Espero sign-off.
- API `withTenant` + Zod: depende del schema aprobado.
- Capture en signup/claim: depende del schema + API.
- Email gating Resend d0/d2/d7: depende de ZAL-139 cierre.
- Audit log: depende del esquema que Hermin apruebe.
- Tests unitarios: dependen del schema.
- Test e2e (Playwright): fuera de mi scope sin autorización explícita del board.

**Lo que YA está en repo y queda como contrato público para el futuro `owner_consent`:**

- `src/lib/consent/state.ts` — read-only (`getConsentSnapshot`, `subscribeConsent`, `hasAnalyticsConsent`). Diseñado para que el storage real lo reemplace sin tocar consumidores.
- `src/lib/consent/store.ts` (ZAL-156.2, commit `d950a9286`) — storage cliente-side con localStorage versionado, cross-tab sync, default-deny. Pieza análoga del lado cliente.
- ZAL-160 (commit `3963ae569`) wired el gate de `page_view` contra `hasAnalyticsConsent()`. 25 tests verdes. Sigue `in_review` esperando cierre de ZAL-158 para re-verificar el swap stub→storage real.

**Próximos pasos (cuando Hermin apruebe + ZAL-139 cierre):**

1. Ajustar campos de `owner_consent` si Hermin pidió cambios (especialmente `policy_version`, `source` enum, `revocation_reason` formato).
2. Crear migration Drizzle + `src/db/schema/owner-consent.ts`. Aplicar local, NO remoto.
3. API `src/app/api/consent/route.ts` con `withTenant` + Zod. Respuestas `apiSuccess`/`apiError`. Aislamiento por `tenantId` + `profileId` del owner.
4. Capture signup/claim: hook en flujo existente con `source: 'signup' | 'claim'`, `policy_version: 'v1-2026-08-01'`, `granted_at: now()`. **No pre-checked, no bundled.**
5. Email gating: en worker/cron Resend d0/d2/d7, leer `owner_consent` antes de encolar; `revoked_at IS NOT NULL OR granted = false` → parar. Footer de cada mail con link de revocación.
6. Audit log por cada grant/revoke/import con `actor_id`, `timestamp`, `delta_json`.
7. Tests unitarios grant/revoke/re-grant/re-import. Mantener verde `tests/consent-gate.test.ts` (lo prometió ZAL-160 al board).
8. Mencionar a Web Developer en ZAL-158 al cerrar para que ZAL-160 re-verifique swap stub→storage real y cierre a `done`.

**Limitaciones de este run:**

- No se tocó código, no se aplicaron migraciones, no se ejecutaron servicios externos.
- Si el board prefiere que instrumente sin esperar a Hermin (riesgo de retrabajo), responder en el hilo de ZAL-158.

**Vault:** Changelog actualizado. Sin cambios en código ni en `Decisiones` (la decisión de no-instrumentar-pendiente-Hermin queda en el hilo de Paperclip, no es decisión de vault).

---

## 2026-08-02 - ZAL-156.2 [GTM-DEP.2] Storage canónico de consent (cross-tab + banner UI)

Cierra el último sub-issue de GTM-DEP. Reemplaza el stub default-deny de
ZAL-160 por el storage canónico: sincronización cross-tab vía `storage`
event y banner UI de cookies WCAG-AA. Misma API expuesta por
`src/lib/consent/state.ts` — los consumidores (`trackPageView`,
`usePageTracking`) no requirieron cambios, como anticipaba el diseño de
ZAL-160.

**Decisión técnica:**

- `src/lib/consent/store.ts` deja de ser "stub" y pasa a ser la
  implementación de referencia del storage de consent. Mantiene
  `localStorage` con clave versionada (`zaltyko.consent.v1`) y misma
  semántica de default-deny.
- Sincronización entre pestañas del mismo origen: el store instala un
  `storage` event listener en `window` perezosamente (primera llamada
  a `readConsent` / `writeConsent` / `subscribeConsent`). Cuando otra
  pestaña escribe o purga, los listeners locales reciben el snapshot
  vigente y `usePageTracking` re-trackea si el cambio es a `granted`.
- `__resetConsentForTests()` (solo en no-prod) limpia el listener
  registry y resetea el flag de binding. Necesario en tests porque el
  stub de `window` cambia entre tests.
- Banner UI `<CookieConsentBanner />`:
  - Solo visible cuando el consent está en `unset`. Una vez que el
    usuario opta, el banner no vuelve a salir ni en reload.
  - Dos opciones: Aceptar (`granted`) / Rechazar (`revoked`). Sin
    botón "X" — sería un patrón oscuro (cerrar sin elegir ≡ denegar,
    pero el storage queda en `unset` y el banner reaparece).
  - WCAG 2.2 AA: `role="dialog"`, `aria-labelledby`/`aria-describedby`,
    `autoFocus` en Aceptar, `motion-reduce:animate-none` para usuarios
    que lo prefieren reducido.
  - Copy alineado con `vault/04-Marketing/Mensajes aprobados.md`:
    "privacidad por diseño", sin prometer "RGPD Compliant".

**Cambios concretos:**

- **Modificado**: `src/lib/consent/store.ts` — añadida sincronización
  cross-tab vía `storage` event (binding perezoso), listener registry
  con `Set<ConsentListener>`, helper de tests `__resetConsentForTests`.
- **Modificado**: `src/lib/consent/state.ts` — comentario del módulo
  actualizado: el store ya no es "stub", es la implementación
  canónica. La API expuesta (`getConsentSnapshot`, `subscribeConsent`,
  `hasAnalyticsConsent`) no cambia.
- **Nuevo**: `src/components/CookieConsentBanner.tsx` — banner
  minimalista WCAG-AA, Aceptar/Rechazar, copia aprobada.
- **Modificado**: `src/app/layout.tsx` — monta `<CookieConsentBanner />`
  en el root layout, junto a `<UtmCapture />` (todos client-only).
- **Modificado**: `tests/consent-gate.test.ts` — añadidos 5 tests
  para la sincronización cross-tab (storage event con key válida,
  removeItem, key distinta, instalación perezosa, reset de test hook).
  El stub de `window` ahora incluye `addEventListener` /
  `dispatchEvent` basados en `EventTarget` para soportar el binding;
  helper `makeStorageEvent` polyfill del constructor (no existe en
  el test environment node).

**Cobertura (ZAL-156.2):**

- `tests/consent-gate.test.ts` — 25 tests, todos verdes (+5 vs ZAL-160).
  - Cross-tab: storage event desde "otra pestaña" notifica con el
    valor nuevo; `removeItem` también notifica (vía `newValue: null`);
    storage event con key distinta a la del consent NO notifica.
  - Instalación: el listener se instala perezosamente en el primer
    uso (no se añade hasta `readConsent` / `writeConsent` /
    `subscribeConsent`).
  - Test hook: `__resetConsentForTests()` limpia el registry y
    resetea el flag de binding.
- Tests previos (matriz consent × UTM, persistencia, suscripción) sin
  cambios — siguen verdes, confirma que la API expuesta por `state.ts`
  no cambió.

**Coordinación con ZAL-160:**

- ZAL-160 ya anticipaba este reemplazo: "ZAL-156.2 es la issue
  designada para el storage canónico de consent. El stub actual vive
  en `src/lib/consent/store.ts`; cuando ZAL-156.2 entregue su
  implementación, el reemplazo debe mantener la API expuesta por
  `src/lib/consent/state.ts`". Confirmado: el store mantiene la
  misma API; los consumidores no requirieron cambios.
- Si en el futuro se quiere endurecer el storage con HMAC o server-side
  sync (Supabase), la sustitución sigue siendo de una sola pieza en
  `store.ts` sin tocar a los consumidores.

**Fuera de alcance / pendiente:**

- Migración de consentimientos ya escritos con la v1 del stub: la clave
  no cambia, así que no requiere migración. Si en una iteración futura
  se cambia la versión (`v1` → `v2`), se necesitará una migración
  explícita para no perder consentimientos existentes.
- Sincronización del consent entre dispositivos para usuarios
  autenticados (persistir también en Supabase con `user_consent_log`).
  El alcance actual es single-device. El banner funciona en ambos
  casos (el storage client es lo que el gate consulta), pero la
  auditoría forense del consent para GDPR Data Subject Access Request
  queda fuera de scope (ZAL-156 issue separada si aplica).
- Localización del banner: copy actual en español, alineado con el
  mercado hispano (LATAM + US Hispanic). Otros locales no son scope.
- `prefers-reduced-motion` cubre el `animate-in`, pero el icono o la
  jerarquía visual no cambian. Si se quiere un banner más sobrio (sin
  borde redondeado, sin shadow), decisión de producto separada.

**Riesgos / notas:**

- El banner se monta en el root layout sincrónicamente. En SSR
  devuelve `null` (no hay `window`); en cliente, antes del `useEffect`
  también devuelve `null` para evitar parpadeo si el usuario ya optó.
  El primer paint con `unset` mostrará el banner con un slide-in.
- `dispatchEvent` para `storage` en producción: el browser real
  dispara el evento automáticamente. El store no hace
  `dispatchEvent` propio — solo escucha. El path de `writeConsent`
  notifica a los listeners locales por su cuenta (no necesita
  disparar `storage` porque el browser ya lo hace).
- El test environment es `node` (no jsdom), por eso el stub
  `EventTarget` y el polyfill de `StorageEvent`. En jsdom o browsers
  reales esto no aplica.

**Costo:** 0 USD (storage canónico client-side, sin servicios externos).

## 2026-08-02 - ZAL-157 [GTM-DEP.1] UTM capture en signup (first-touch, sessionStorage)

Captura client-side de los 5 parámetros UTM (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`) en el signup del owner y los persiste en `academies.utm_*`. Regla first-touch: si el owner llegó por una landing con UTMs, esos valores se preservan aunque la URL del signup venga sin UTMs o con otros distintos. Es la fundación de la atribución del canal de registro (ZAL-159) — sin first-touch, las academias que entran por landing → navegan → signup pierden atribución.

**Decisión técnica:**

- Captura client-side en cada page view (`<UtmCapture />` montado en el root layout) → persistencia en `sessionStorage` con regla first-touch (no sobrescribe valores existentes).
- Precedencia en signup: `explicit > sessionStorage > URL`. URL gana solo en cold start sin sesión previa.
- Validación al ingreso: `trim + lowercase + colapsa espacios a _ + quita caracteres no permitidos` (snake_case Hermin §4, max 200 chars por columna).
- Storage: columnas nuevas en `academies` (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_captured_at`, `utm_landing_path`) + 2 índices (`academies_utm_source_idx`, `academies_utm_medium_idx`) para queries de ROI por canal.
- SSR-safe: si `window` no existe, helpers no operan y devuelven `{}` o `null`. No bloqueamos la captura si `sessionStorage` está deshabilitado (modo privado).
- El signup (fallback) y el claim path (seed list match) ambos persisten UTMs + `utm_landing_path` + `utm_captured_at`. Regla: si la academia seed ya venía con UTMs del pre-registro, los respetamos (no sobrescribimos en claim path).
- `clearStoredUtm()` al final del signup/claim exitoso purga el storage para que la siguiente sesión no herede UTMs de la anterior.
- `trackPageView` (ZAL-160) adjunta los UTMs persistidos al payload `$pageview` cuando hay consent — sin re-leer storage en el resto del funnel.

**Cambios concretos:**

- **Nuevo**: `src/lib/gtm/utm.ts` — helpers client-side (`readUtmFromUrl`, `captureUtm`, `readStoredUtm`, `readUtmForSignup`, `clearStoredUtm`) + tipos `CapturedUtm` + constantes `UTM_KEYS` y `SESSION_STORAGE_KEY`.
- **Nuevo**: `src/components/UtmCapture.tsx` — componente client-only que llama `captureUtm()` en mount (idempotente). Montado una vez en el root layout.
- **Nuevo**: `drizzle/0007_academies_utm_columns.sql` — 7 columnas nuevas + 2 índices + comentarios in-DB sobre la taxonomía. NO instala triggers (la API es la única fuente de escritura).
- **Modificado**: `src/app/layout.tsx` — monta `<UtmCapture />` en el root layout (cliente).
- **Modificado**: `src/app/onboarding/owner/page.tsx` — pasa `suggestedFullName` al componente; la captura UTMs sucede en el form.
- **Modificado**: `src/components/onboarding/OwnerOnboardingForm.tsx` — en submit, `captureUtm()` + `readUtmForSignup()` → envía `utm` en el body al backend. `clearStoredUtm()` post-success.
- **Nuevo**: `src/components/onboarding/OwnerClaimCard.tsx` + `src/app/api/onboarding/owner/claim/route.ts` + `src/lib/onboarding/owner-claim.ts` — camino D-006 v0 que también persiste UTMs (mismo helper client + persistencia servidor con regla first-touch).
- **Modificado**: `src/lib/onboarding/owner-claim.ts` — `ClaimAcademyBodySchema` acepta `utm` opcional; `claimAcademy` solo escribe UTMs si la academia seed estaba vacía y al menos uno de source/medium viene.
- **Modificado**: `src/app/api/onboarding/owner/route.ts` — `bodySchema` acepta `utm` opcional; `createAcademy` los persiste; `logEvent("academy_created")` lleva UTMs en metadata.
- **Modificado**: `src/app/api/academies/academies.lib.ts` — `createAcademy` recibe `utm` opcional, normaliza campos (`utm_source`/`utm_medium` principales, `utm_captured_at` solo si source o medium viene), persiste en INSERT.
- **Modificado**: `src/db/schema/academies.ts` — añadidas las 7 columnas UTM + 2 índices.
- **Modificado**: `src/lib/analytics.ts` — `trackPageView` adjunta `readStoredUtm()` al payload (enriquecimiento de evento sin doble lectura).

**Cobertura (ZAL-157):**

- `tests/gtm-utm.test.ts` — 13 tests, todos verdes.
  - URL parsing: 5 keys + omite vacíos + URLSearchParams directo + max 200 chars + normalización.
  - First-touch sessionStorage: persiste si URL trae, respeta primer touch en navegación interna, no-op sin UTMs, landing path solo en primera captura.
  - `readUtmForSignup`: null cuando nada, mezcla explicit > storage > URL, cold start con URL directa.
  - SSR-safe: no lanza si `window` undefined.
- `tests/api/owner-claim.test.ts` — 11 tests, todos verdes.
  - `findClaimableAcademyByEmail`: match case-insensitive, sin match, email vacío/espacios.
  - `claimAcademy`: happy path con tenantId reusado, 403 CLAIM_EMAIL_MISMATCH, 404 ACADEMY_NOT_FOUND.
  - POST `/api/onboarding/owner/claim`: 401 sin sesión, 400 INVALID_PAYLOAD, happy path con `logEvent("owner_claimed")`.
  - POST `/api/onboarding/owner` (fallback): 400 INVALID_PHONE si teléfono mal formado, sin INVALID_PHONE si teléfono ausente (compatibilidad callers viejos).

**Notas de coordinación con ZAL-160 / ZAL-159:**

- ZAL-160 (consent gate) usa `readStoredUtm()` de ZAL-157 para enriquecer `posthog.capture("$pageview", ...)` solo cuando hay consent. El gate aplica al page_view (arrastra cookies); el resto del funnel trackea post-signup sin gate porque magic link prueba identidad.
- ZAL-159 (`canal_registro`) consume los UTMs persistidos en `academies.utm_*` y deriva el canal vía `derivar_canal(utm_source, utm_medium)`. Sin ZAL-157 no hay dato que derivar.
- Migración `drizzle/0007_academies_utm_columns.sql` está escrita pero NO aplicada a Supabase (regla AGENTS.md — no migraciones remotas sin board). Antes de ZAL-159 instalar su trigger (migración 0008), validar que 0007 ya está aplicada: si no, el trigger falla porque `utm_source`/`utm_medium` no existen.

**Fuera de alcance / pendiente:**

- **Migración NO aplicada**: `drizzle/0007_academies_utm_columns.sql` está staged pero sin entrada en `drizzle/meta/_journal.json`. Aplicar solo con aprobación del board y siguiendo la regla de la guía de trabajo para agentes.
- Test e2e de navegador con Playwright: signup con UTM completo → verifica row en `academies` con valores correctos. Requiere entorno browser; queda fuera del MVP de tests unitarios/API.
- Server-side UTM stamping: solo captura client-side en MVP. Multi-touch attribution queda para iteración futura.
- Derivación de canal desde UTM vive en ZAL-159 (resuelto por `derivar_canal`).

**Costo:** 0 USD (sessionStorage + columnas DB existentes, sin servicios externos).

## 2026-08-02 - ZAL-160 [GTM-DEP.4] page_view consentido (analytics gating client-side)

Cierra el gate de `page_view` para que solo se persista cuando hay consent activo. Sin consent (`unset` o `revoked`) el evento se descarta y no se carga `posthog-js` ni se ejecuta `posthog.capture`. El resto del funnel (signup/claim/invite/activation) sigue trackeándose post-signup porque el magic link prueba identidad — esta restricción aplica solo al evento de visita porque arrastra cookies.

**Decisión técnica:**

- Contrato read-only en `src/lib/consent/state.ts` (`getConsentSnapshot`, `subscribeConsent`, `hasAnalyticsConsent`). Pensado para que el storage real de ZAL-156.2 lo reemplace sin tocar a los consumidores.
- Stub default-deny en `src/lib/consent/store.ts` con `localStorage` clave `zaltyko.consent.v1` (versionada). Valores posibles: `granted` / `revoked` / `unset` (default). SSR-safe: server-side devuelve `unset`, ningún listener se ejecuta.
- `trackPageView` ahora consulta `hasAnalyticsConsent()` antes de cualquier side effect. Si es `false`, loguea en dev y retorna sin invocar `posthog-js`. Si es `true`, adjunta UTMs desde `readStoredUtm()` (first-touch de ZAL-157) al payload `$pageview`.
- `usePageTracking` (PostHogProvider) consulta consent en cada navegación (pushState/popstate) — sin cache — para que un cambio de consent a mitad de sesión se refleje en el siguiente page_view sin reload. Adicional: si el usuario otorga consent DESPUÉS del mount (caso banner de cookies), re-trackea la página actual una vez.
- Default-deny confirmado por tests: `unset` + cualquier UTM descarta; `granted` + UTM emite y adjunta UTMs; `revoked` + UTM descarta.

**Cambios concretos:**

- **Nuevo**: `src/lib/consent/state.ts` — contrato read-only (tipos + 3 funciones).
- **Nuevo**: `src/lib/consent/store.ts` — stub default-deny con `readConsent` / `writeConsent` / `subscribeConsent`. SSR-safe, storage corrupto → `unset`, valor `unset` purga la clave.
- **Nuevo**: `tests/consent-gate.test.ts` — cobertura de la matriz completa (3 estados × 2 UTM × escenarios extra de persistencia/suscripción).
- **Modificado**: `src/lib/analytics.ts` — `trackPageView` consulta `hasAnalyticsConsent()` y adjunta UTMs persistidos solo cuando hay consent.
- **Modificado**: `src/components/PostHogProvider.tsx` — `usePageTracking` consulta consent en cada navegación y se suscribe para re-trackear cuando se otorga consent después del mount.

**Cobertura (ZAL-160):**

- `tests/consent-gate.test.ts` — 20 tests, todos verdes.
- Matriz cubierta explícitamente:
  - `unset` + sin UTM → descarta
  - `unset` + con UTM → descarta (consent es gate duro)
  - `granted` + sin UTM → emite sin UTM en payload
  - `granted` + con UTM completo (5 keys + landing_path) → emite con UTM adjunto
  - `granted` + UTM parcial → emite solo las claves presentes
  - `revoked` + sin UTM → descarta
  - `revoked` + con UTM → descarta (revocación apaga tracking)
- Suscripción: callback idempotente, grant/revoke notifica, unsubscriber detiene, múltiples listeners independientes.
- Persistencia: sobrevive relectura, clave versionada, `unset` purga, storage corrupto → `unset`.

**Coordinación con ZAL-156.2 (consent gate tracking):**

- ZAL-156.2 es la issue designada para el storage canónico de consent. El stub actual vive en `src/lib/consent/store.ts`; cuando ZAL-156.2 entregue su implementación, el reemplazo debe mantener la API expuesta por `src/lib/consent/state.ts` (`readConsent`, `subscribeConsent`). Los consumidores (`trackPageView`, `usePageTracking`) NO deberían requerir cambios.
- Dependencia declarada en ZAL-160. Mientras 156.2 no esté en `done`, el storage real es este stub. El gate funciona end-to-end contra el stub; el día que 156.2 lo reemplace, no hay re-trabajo del gate.
- Si 156.2 introduce un banner UI de cookies, ese banner debe llamar `writeConsent("granted")` / `writeConsent("revoked")` desde `src/lib/consent/store.ts` (o del módulo equivalente en 156.2 si expone esa función). No meterse en cómo se captura el consent — eso es scope de 156.2.

**Fuera de alcance / pendiente:**

- UI del banner de cookies para capturar el consent del usuario — eso es ZAL-156.2. El gate de ZAL-160 funciona contra cualquier productor que setee `writeConsent`.
- Test e2e de navegador con Playwright del flujo consent-grant → page_view emitido → revoke → page_view descartado. Requiere banner UI, queda bloqueado hasta 156.2.
- Sync entre pestañas del consent via `storage` event. Single-tab es suficiente para MVP; si Bumble pide cross-tab en una iteración futura, se añade en `store.ts`.
- Pre-existing tests al margen: `tests/gtm-utm.test.ts` y `tests/api/owner-claim.test.ts` ya fueron arreglados en ZAL-157 (`utm_landing_path` se incluye ahora en el JSON principal de sessionStorage y el mock de `withTransaction` provee la forma completa de db para que `tx.select/insert/update` funcionen). Total verde: 44 tests (13 + 20 + 11).

**Riesgos / notas:**

- Si `posthog-js` se carga via `<Analytics />` de Vercel en `layout.tsx`, eso es independiente del gate de page_view. El gate de ZAL-160 aplica específicamente a `posthog.capture("$pageview", ...)`, no a Vercel Analytics. Revisar si Vercel Analytics necesita su propio gate (separado, decisión de producto) — out of scope de ZAL-160.
- Si en producción el opt-in se captura vía banner visible antes de cualquier navegación, el usuario verá la home antes de poder aceptar. Eso es comportamiento esperado: el primer page_view se descarta, y los siguientes (post-accept) se trackean. Si producto quiere lo contrario, hay que mover el banner al SSR/edge — out of scope.
- El stub de `store.ts` no cifra ni firma el valor en `localStorage`. Si 156.2 quiere integridad criptográfica, debe vivir en su reemplazo, no aquí.

**Costo:** 0 USD (gate client-side, sin servicios externos nuevos).

## 2026-08-02 - ZAL-159 [GTM-DEP.3] Canal de registro attribution

Cierra la derivación del campo `canal_registro` desde los UTM capturados en signup. Cada academia queda atribuida al canal que la trajo para que Bumble calcule ROI por canal con datos, no estimaciones.

**Decisión técnica:**

- Regla de precedencia `paid > social > email > organic > direct` implementada como función pura `derivar_canal(utm_source, utm_medium)` en `src/lib/gtm/canal.ts`, con alias `resolveCanal({utm_source, utm_medium})` para compatibilidad con la cobertura previa. Ambas firmas pasan por la misma lógica `resolveFromNormalized()` para evitar divergencia.
- La precedencia se aplica en el orden contractual completo: `utm_medium=cpc` o source paid → paid; después social, email y organic. Por ejemplo, `instagram+cpc → paid`, mientras `google_ads+email → paid`.
- Persistencia en dos capas: TS (`createAcademy` calcula `canal_registro` y lo pasa en el INSERT para devolverlo sin re-leer) + DB (función SQL pura/inmutable y trigger BEFORE INSERT).
- Snapshot first-touch: el único UPDATE permitido es el claim/signup efectivo de una academia pre-registrada cuyos UTM anteriores estaban vacíos y cuyo canal era `direct`/NULL. Cualquier actualización posterior conserva la atribución.
- Taxonomía `whatsapp → social` explícita (no `direct`) en línea con la nota de Hermin §4.
- `google` como alias genérico: solo el medium válido determina el canal; sin medium o con UTM inválido cae a `direct`, igual que exige el alcance aceptado.

**Cambios concretos:**

- **Nuevo**: `drizzle/0008_academies_canal_registro.sql` — columna `academies.canal_registro` + función pura `academies_canal_registro_value()` + wrapper de trigger + BEFORE INSERT + UPDATE guardado para el primer claim + backfill idempotente + 5 índices parciales por canal sobre `(tenant_id, created_at)`.
- **Modificado**: `src/lib/gtm/canal.ts` — `resolveCanal()` y `derivar_canal()` comparten la misma precedencia exacta y exponen solo `paid | social | email | organic | direct`.
- **Modificado**: `src/db/schema/academies.ts` — añadida `canalRegistro: text("canal_registro")`.
- **Modificado**: `src/app/api/academies/academies.lib.ts` — `createAcademy` calcula `canalRegistro` con `derivar_canal(utm_source, utm_medium)` y lo persiste en el INSERT; el valor también se devuelve en `createAcademyResult` para evitar re-lectura.
- **Modificado**: `src/lib/onboarding/owner-claim.ts` — `claimAcademy` recalcula `canalRegistro` cuando rellena UTMs en el claim path (cuando el seed venía vacío y el signup trae UTMs nuevos).
- **Modificado**: `src/app/api/onboarding/owner/route.ts` — expone `canalRegistro` en la respuesta (`apiCreated({...canalRegistro})`) y en el metadata del `logEvent("academy_created")` para que el funnel post-signup vea el canal.
- **Modificado**: `tests/gtm-canal.test.ts` — cobertura parametrizada de cada rama, conflictos de precedencia, normalización, UTM inválido → direct y contrato estático de la migración inmutable.
- **Nuevo**: `tests/gtm-canal-create-academy.test.ts` — smoke de servicio que verifica que `createAcademy` escribe el snapshot correcto para los cinco canales y los conflictos relevantes.
- **Modificado**: `tests/api/owner-claim.test.ts` — verifica primera captura en claim y que una atribución existente no se sobrescribe.

**Cobertura (ZAL-159):**

- Corrección versionada en commit `0c596123c` sobre la implementación base `9ce0d727e`.
- `tests/gtm-canal.test.ts` + `tests/gtm-canal-create-academy.test.ts`: **83/83 verdes**.
- `tests/api/owner-claim.test.ts` + `tests/gtm-utm.test.ts`: **26/26 verdes**.
- ESLint focalizado: 0 errores (2 warnings preexistentes en el test de claim). `git diff --check`: limpio.
- `pnpm typecheck` global no es evidencia verde: falla en el árbol `mobile/` por dependencias Expo/React Native ausentes y un conflicto de casing `Button.tsx`/`button.tsx`; no se detectó un error focalizado en este cambio.
- `pnpm check:migrations` falla de forma explícita por los SQL 0006, 0007 y 0008 fuera de `drizzle/meta/_journal.json`. No se alteró el journal ni se aplicó SQL; el versionado queda como gate de Platform/Security en [ZAL-174](/ZAL/issues/ZAL-174).

**Fuera de alcance / pendiente:**

- **Migración NO aplicada a DB**: `drizzle/0008_academies_canal_registro.sql` está escrita pero NO se ejecutó contra Supabase (regla AGENTS.md — no ejecutar migraciones remotas sin aprobación del board). Para aplicarla a una DB real: correr manualmente el archivo (idempotente — todas las sentencias usan `IF NOT EXISTS` / `OR REPLACE` / `DROP IF EXISTS`) o regenerar con `pnpm db:generate` después de añadir la entrada correspondiente en `drizzle/meta/_journal.json`.
- **Misma situación para `drizzle/0007_academies_utm_columns.sql`** (ZAL-157, del autor previo): no aplicado aún, sin entrada en el `_journal.json`. Antes de aplicar 0008, validar que 0007 ya está aplicada en la DB objetivo — si no, las columnas `utm_source`/`utm_medium` no existirán y el trigger 0008 fallará al instalarse.
- **Asimetría con `_journal.json`**: tanto 0007 como 0008 son archivos staged (hand-written SQL), no snapshots drizzle. Un `pnpm db:generate` futuro puede regenerarlas como snapshots y duplicar trabajo. Mantener el flag "staged, no regenerar con kit" en la cabecera de cada archivo.
- Test E2E de navegador signup→canal no ejecutado: Playwright requiere autorización explícita del board. Se delega a QA con ese gate visible.

**Notas de coordinación:**

- El `_journal.json` actual va hasta 0005. Los archivos 0006, 0007 y 0008 son todos manuales. Cualquier agente que corra `drizzle-kit generate` debe saber que va a generar conflictos (snapshot diff vs DB real). Sugerencia: si se hace generate, alinear primero `_journal.json` con los hand-written aplicando en orden.
- Revisión de Supabase changelog 2026-08-02: los avisos recientes afectan versionado de extensiones y upgrades de PostgreSQL, no el SQL aditivo de esta tarea. La migración permanece local/no aplicada y pasa a revisión de Platform/Security en [ZAL-174](/ZAL/issues/ZAL-174).
- Handoff encadenado: Engineering Lead en [ZAL-175](/ZAL/issues/ZAL-175) y QA en [ZAL-176](/ZAL/issues/ZAL-176). QA permanece bloqueada hasta ambos veredictos y debe obtener autorización explícita del board antes de Playwright.
- `resolveCanal` se preservó como firma por compatibilidad con los tests existentes en `gtm-canal.test.ts`; el spec de ZAL-159 nombra la firma posicional `derivar_canal(utm_source, utm_medium)`, expuesta como alias del mismo cuerpo.

**Costo:** 0 USD (cálculo en DB trigger, sin servicios externos).

## 2026-08-01 - ZAL-137 auditoría y gate condicional CP/teléfono en onboarding owner (D-006 v0)

Diagnóstico read-first antes de tocar código, alineado con la decisión de diseño del board (`ver SPEC_ONBOARDING_ZALTYKO_WEB.md §Gates`):

- **Estado real del repo verificado**: `apps/web/src/...` del comentario de Fizz no existe en este repo. La ruta viva es `src/app/onboarding/owner/page.tsx` + `src/components/onboarding/OwnerOnboardingForm.tsx` + `src/app/api/onboarding/owner/route.ts`. Es flujo crear-desde-cero, no hay claim legacy. `contactEmail` ya está indexado (`academies_contact_email_idx`) y `contactPhone` también (`academies_contact_phone_idx`) — el índice ya está disponible para la query de match.
- **Decisión adoptada en código**:
  - **Happy path** (email matchea `academies.contactEmail`): el server component hace `findClaimableAcademyByEmail(user.email)` (case-insensitive sobre índice) y renderiza `OwnerClaimCard` con un único botón "Confirmar y entrar". Sin CP/teléfono en el formulario, porque la verificación de ownership es el match de email.
  - **Fallback** (sin match, o la academia seed sin `contactEmail`): se renderiza el formulario existente con un nuevo campo `Teléfono de contacto` marcado como requerido, validado con `validatePhoneNumber` (prefijo `+`, 8-15 dígitos E.164) antes de enviar.
  - Se añadió `POST /api/onboarding/owner/claim` con `claimAcademy()` en transacción: crea perfil (con `onConflictDoNothing` para doble-click), reasigna `academies.ownerId`, inserta membership `owner` (idempotente vía unique index), sincroniza `profile.tenantId` y `profile.activeAcademyId` para que `resolveUserHome` mande al dashboard en lugar de devolver al wizard.
- **Aislamiento de tenant**: el claim reusa el `tenantId` que la academia seed ya tiene (NO genera uno nuevo). Si el caller intenta reclamar con email distinto al `contactEmail` registrado, devuelve 403 `CLAIM_EMAIL_MISMATCH` sin tocar la academia.
- **Persistencia de contacto en fallback**: `academies.contactEmail` y `academies.contactPhone` ahora se persisten al crear la academia desde el wizard (`createAcademy` extiende su `CreateAcademyBodySchema`). Sirve para verificación manual de propiedad y como contacto de la academia recién creada.

Cambios concretos:

- **Nuevo**: `src/lib/onboarding/owner-claim.ts` (helper de búsqueda y servicio de claim).
- **Nuevo**: `src/components/onboarding/OwnerClaimCard.tsx` (UI mínima del happy path).
- **Nuevo**: `src/app/api/onboarding/owner/claim/route.ts` (endpoint HTTP del claim).
- **Nuevo**: `tests/api/owner-claim.test.ts` (cobertura de helper + endpoint + fallback con phone; cubre match case-insensitive, mismatch email, academy inexistente, doble-click via ON CONFLICT, 401/400/201 HTTP, INVALID_PHONE 400, compatibilidad con body sin phone).
- **Modificado**: `src/app/onboarding/owner/page.tsx` (branching server-side por match).
- **Modificado**: `src/components/onboarding/OwnerOnboardingForm.tsx` (acepta `suggestedFullName` + `requireContactPhone`, valida y envía `contactPhone`).
- **Modificado**: `src/app/api/onboarding/owner/route.ts` (schema acepta `contactPhone`, valida con `validatePhoneNumber`, persiste `user.email` y `contactPhone` en la academia creada).
- **Modificado**: `src/app/api/academies/academies.lib.ts` (`CreateAcademyBodySchema` acepta `contactEmail`/`contactPhone`; el insert los persiste).

**Fuera de alcance (debe coordinarse con otros agents):**

- ZAL-138 (magic links para primeras atletas) — no tocado.
- ZAL-139 (plantillas Resend d0/d2/d7) — no tocado.
- ZAL-140 (baseline TTFAA) — no tocado.
- `OnboardingChecklist` ya respeta el gate "first class skipeable/retomable" del SPEC: el item `setup_weekly_schedule` se marca al crear las starter classes en el fallback, pero el owner puede saltarlo en cualquier momento. El happy path (claim) no toca checklist porque las starter classes no son parte de la academia seed (se crean bajo demanda en el dashboard).

## 2026-08-01 - ZAL-138 magic links Supabase para primeras atletas (D-006 v0 gate 1)

Cierra el deliverable 2 del SPEC `vault/06-Roadmap-y-Tareas/SPEC_ONBOARDING_ZALTYKO_WEB.md` (ZAL-130 / D-006 v0): el owner puede invitar hasta 10 primeras atletas por magic link Supabase, y la definición operativa del KPI TTFAA queda anclada a `athletes.magic_link_opened_at IS NOT NULL AND athletes.profile_completed_at IS NOT NULL`.

### Definición operativa de "atleta confirmado"

- **Magic link abierto**: `athletes.magic_link_opened_at` queda seteado cuando la atleta abre el magic link (`acceptInvitationByEmail` corre al final del callback de Supabase).
- **Perfil completo**: `athletes.profile_completed_at` queda seteado cuando envía nombre (requerido) y opcionalmente `dob`/`level` (`POST /api/athlete-invitations/[invitationId]/profile`).
- El KPI TTFAA se calcula contra `athletes`, no contra `athlete_invitations`. La tabla de invitaciones es operativa (ciclo de vida + auditoría + retry) y alimenta el panel del owner con `last_error` cuando Supabase falla.

### Límites, idempotencia y seguridad en la frontera

- `MAX_BULK_INVITES = 10` validado en el schema Zod (mensaje explícito al cliente). Un array de 11 devuelve 400 `INVALID_INVITE_PAYLOAD` antes de tocar Supabase.
- `template` validado con regex `^[a-z0-9_]+$/i` para evitar inyección en el lookup de plantilla. `customMessage` capped a 500 chars.
- `email` se normaliza a lowercase y se trimea; dedup intra-batch antes de generar magic links (mismo email dos veces en el POST = una sola invitación).
- **Reintento seguro**: índice único parcial `athlete_invitations_active_unique` sobre `(academy_id, email_normalized) WHERE status IN ('pending','sent','opened')`. Si el owner reenvía para el mismo email mientras la invitación está activa, `inviteFirstAthletes` reusa la fila, regenera el magic link y sube `attempt_count` (sin duplicar fila ni notificar doble al destinatario).
- **Carrera concurrente**: el INSERT va con `onConflictDoNothing({ target: [academy_id, email_normalized] })`. Si dos requests paralelos chocan, el perdedor re-lee la fila ganadora y la trata como reintento (no se pierde el envío).
- **No exposición de tokens**: la respuesta de la API nunca devuelve `magic_link_token` ni `action_link`. El token se queda server-side y solo se usa para auditoría / retry logging.
- **Aislamiento por tenant**: el helper exige `tenantId` + `academyId` resueltos por `withTenant`. Antes de generar magic links, valida que `academies.tenantId === options.tenantId` (defensa explícita aunque el caller ya pasó por el wrapper). Si no coincide, devuelve `ACADEMY_NOT_FOUND` para todos los emails del batch.

### Flujo end-to-end

1. Owner: `POST /api/academies/[academyId]/athlete-invitations` con `{ emails, template?, customMessage? }`.
2. Backend: genera magic link vía `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })`, persiste `athlete_invitations`, envía email vía Resend con plantilla custom (pendiente ZAL-139).
3. Atleta abre el email → Supabase verifica el token → redirige a `${origin}/api/athlete-invitations/accept`.
4. `accept/route.ts` lee la sesión Supabase → empareja por `email_normalized` → marca `magic_link_opened_at`, crea `athletes` stub con `userId` apuntando al `auth.users` recién creado → redirige al formulario de perfil.
5. Atleta envía nombre + dob + level → `POST /api/athlete-invitations/[invitationId]/profile` → cierra D-006 v0 gate 1 con `profile_completed_at`.

### Aislamiento en endpoints públicos (callback + profile)

Estos dos endpoints NO usan `withTenant` porque la atleta todavía no tiene perfil Zaltyko: su única credencial es la sesión Supabase. La defensa es:

- `accept`: solo lee email de sesión + actualiza invitación matching. No recibe `academyId` del cliente; resuelve por `email_normalized`.
- `profile`: recibe `invitationId` por URL, verifica que `invitations.email === user.email` (case-insensitive). Sin este match, un usuario Supabase autenticado con email A no puede cerrar el perfil de una invitación con email B.
- Rate limit por IP en ambos (`getClientIdentifier(request)` sin userId).

### Permisos y autorización

- `GET/POST /api/academies/[academyId]/athlete-invitations` → con `withTenant`, permiso `athletes:read` / `athletes:create` (entry explícita en `getRequiredRoutePermission` antes del match por prefix, para no chocar con la regla broad `/api/academies`).
- `GET/POST /api/athlete-invitations/accept` → público con rate limit.
- `POST /api/athlete-invitations/[invitationId]/profile` → sesión Supabase + match de email.

### Cambios concretos

- **Nuevo**: `drizzle/0006_athlete_invitations.sql` (tabla `athlete_invitations`, índice único parcial, índice por token, columnas nuevas en `athletes`: `invite_email`, `magic_link_opened_at`, `profile_completed_at`, índice compuesto `athletes_activation_idx` para el KPI).
- **Nuevo**: `src/db/schema/athlete-invitations.ts` (schema Drizzle + tipos inferidos).
- **Nuevo**: `src/lib/athletes/invitations.ts` (`inviteFirstAthletes`, `acceptInvitationByEmail`, `completeAthleteProfile`, `listInvitationsForAcademy`, constantes `MAX_BULK_INVITES`/`INVITATION_TTL_HOURS`/`INVITATION_STATUS`, schemas Zod, generador de magic link inyectable para tests).
- **Nuevo**: `src/app/api/academies/[academyId]/athlete-invitations/route.ts` (POST bulk + GET listado con summary de confirmados).
- **Nuevo**: `src/app/api/athlete-invitations/accept/route.ts` (callback público; GET y POST para tolerar el método que use Supabase).
- **Nuevo**: `src/app/api/athlete-invitations/[invitationId]/profile/route.ts` (cierre de gate 1).
- **Nuevo**: `tests/api/athlete-invitations.test.ts` (cobertura: dedup intra-batch, idempotencia de retry con `attempt_count` incremental, `ACADEMY_NOT_FOUND` si la academia/tenant no coinciden, persistencia de `last_error` cuando Supabase falla, validación de max 10 y template regex, marcado de `magic_link_opened_at` al primer clic y no-op al segundo, `completeAthleteProfile` setea ambos campos + `TENANT_MISMATCH`).
- **Modificado**: `src/db/schema/athletes.ts` (columnas D-006 v0 + índices nuevos).
- **Modificado**: `src/db/schema/index.ts` (export del nuevo schema).
- **Modificado**: `src/lib/authz/route-permissions.ts` (entry específica para `/api/academies/[^/]+/athlete-invitations` con `athletes:read`/`athletes:create`).
- **Ajuste de continuidad**: `claimAcademy()` toma `pg_advisory_xact_lock` por `userId` dentro de la transacción, haciendo efectivo el contrato de doble-click concurrente; el test HTTP usa un UUID válido para atravesar el schema Zod.

### Verificación ejecutada

- **Tests**: `corepack pnpm@9.15.3 install` + `vitest run tests/api/athlete-invitations.test.ts` → **16/16 pasan** (cubren dedup, idempotencia con `attempt_count` incremental, `ACADEMY_NOT_FOUND`, persistencia de `last_error` cuando Supabase falla, validación max 10 + template regex + dob vacío, marcado de `magic_link_opened_at` al primer clic + no-op al segundo, `completeAthleteProfile` con `TENANT_MISMATCH`). En la primera corrida había 3 fallos por un bug en el mock de `db.update` (sólo aplicaba los cambios cuando se llamaba `.limit()`, mientras que el helper usa `await ... .where()` directo). Reescrito para que `then` aplique el `set` pendiente: mock ahora refleja el comportamiento real de Drizzle.
- **Typecheck**: `corepack pnpm@9.15.3 typecheck` queda limpio para los archivos de ZAL-138 (`src/lib/athletes/invitations.ts`, las 3 rutas API y los schemas). Los errores que quedan en el repo son de ZAL-137 (`src/app/api/onboarding/owner/claim/route.ts(71,5)`: `owner_claimed` no está en `EventType`) y de `mobile/*` por dependencias Expo no instaladas — preexistentes, fuera de alcance de este PR.
- **Refactor derivado del typecheck**: `acceptInvitationByEmail` antes llamaba `supabase.auth.admin.getUserByEmail(email)` para recuperar el `userId` y crear el athlete stub. Esa API no existe en `GoTrueAdminApi` (sólo `getUserById`/`listUsers`). Reemplazado por el resolver, que ahora expone `getCurrentUser(): Promise<{ id; email } | null>` — la sesión Supabase ya está abierta cuando la atleta abre el magic link, así que `user.id` viene gratis de `supabase.auth.getUser()`. La API pública del helper queda más simple (un solo round-trip al server client en vez de dos) y la API mockeable para tests queda más coherente.
- **Migración**: NO se aplicó a la DB real (ver `vault/00-Inicio/Guia de trabajo para agentes.md` §Migraciones — sólo el board autoriza migraciones remotas). Pendiente ejecutar `pnpm db:migrate` antes de mergear a main.
- **Llamadas a Supabase**: ningún endpoint probado contra Supabase real en este heartbeat. El generador mockeable del helper garantiza que los tests no dependen del SDK.

### Riesgos residuales / pendientes

1. **Migración sin aplicar**: la tabla `athlete_invitations` y las columnas nuevas en `athletes` no existen en la DB hasta que se ejecute `pnpm db:migrate`. Coordinar con el board antes del primer uso en producción.
2. **Plantilla de email**: el endpoint de invite genera el magic link pero no envía email (queda como TODO explícito para ZAL-139 — plantillas Resend d0/d2/d7 con QA de copy). Sin ZAL-139 desplegado, el destinatario nunca recibe el magic link y el flujo muere en `pending`. Documentado en el SPEC como dependencia del gate 3.
3. **UI cliente**: hay endpoints pero no hay formulario para que el owner pegue la lista de emails. Queda para una issue hija (probablemente ZAL-141 o back into ZAL-138 UI). El owner puede usar `curl` para probar el flujo end-to-end hoy.
4. **Páginas de aterrizaje**: `/onboarding/athlete/profile?invitation=...` y `/onboarding/athlete/expired` aún no existen. El callback redirige ahí, pero las páginas devuelven 404 hasta que se creen. No bloquea el flujo server-side pero sí bloquea E2E en navegador.
5. **onConflictDoNothing con índice parcial**: Drizzle genera `ON CONFLICT (academy_id, email_normalized) DO NOTHING` sin la cláusula WHERE del índice parcial. En la práctica el índice único parcial rechaza el duplicado al nivel DB y `inserted.length === 0` activa el camino de re-lectura, así que el comportamiento observable es correcto. Pero para v1 conviene considerar mover a ON CONFLICT explícito con raw SQL que incluya el WHERE.

### Coordina con

- ZAL-139 (Content): sin plantillas Resend, no hay email que llegue al destinatario. Gate 3 del SPEC bloquea el flujo real hasta que ZAL-139 cierre.
- ZAL-140 (Data & Analytics): las columnas `athletes.magic_link_opened_at` + `athletes.profile_completed_at` son la fuente del KPI TTFAA. El baseline pre-rollout lo mide ZAL-140.
- Platform & Security: requiere revisión antes de mergear a main — la ruta pública `/api/athlete-invitations/accept` no usa `withTenant` por diseño (la atleta no tiene tenant Zaltyko todavía), y eso es una desviación de la regla "todas las APIs tenant usan withTenant". La excepción está documentada arriba con la defensa por match de email + rate limit + expiración del token.

Vault: actualizadas `Changelog interno.md`, `athletes.ts`, `athlete-invitations.ts`, `index.ts`, `route-permissions.ts`, `invitations.ts`, `route.ts` (POST/GET bulk), `accept/route.ts`, `[invitationId]/profile/route.ts`, `0006_athlete_invitations.sql`, `athlete-invitations.test.ts`.

**Verificación**:

- `pnpm typecheck` no arrancó: `node_modules/` está vacío en este workspace y la `engines.pnpm` requerida (9.15.3) difiere del pnpm disponible (9.15.4). Bloqueo preexistente del entorno, no del cambio.
- Tests escritos pero no ejecutados localmente por el mismo motivo (sin deps). Cobertura definida: 9 escenarios cubriendo match, mismatch, fallback con/sin phone, doble-click, HTTP 401/400/201/403/404.

**Riesgos residuales / pendientes**:

1. La academia seed actualmente no existe en este workspace (DB local sin academias pre-registradas con `contactEmail`). El happy path solo se activa cuando se siembra una. QA debe poblar al menos una academia seed con `contactEmail` para validar el flujo end-to-end.
2. El claim no fuerza trial ni suscripción; reutiliza el estado actual de la academia. Si la academia seed ya tenía `isTrialActive = false`, el owner reclamante hereda esa condición. Documentar como gap si QA detecta fricción.
3. Si la academia seed no tiene `ownerId` válido (lo cual violaría el `notNull` del schema), la migración previa al deploy del flujo debe garantizar que existe un perfil placeholder. **No se ejecutó ninguna migración** — esto es una nota para el responsable del seed, no para este PR.

**Handoff a QA** (orden sugerido):

1. Crear academia seed con `contactEmail = duena@test.com`, `ownerId = <profile_placeholder>`.
2. Login con `duena@test.com` → debe aterrizar en `/onboarding/owner` mostrando `OwnerClaimCard` con mensaje "Te identificamos como dueña de [nombre]".
3. Click "Confirmar y entrar" → debe redirigir a `/app/<id>/dashboard` con sesión activa como owner.
4. Repetir con email que NO matchea ningún `contactEmail` → debe mostrar el formulario completo con el campo "Teléfono de contacto" requerido y validación `+XX ...`.
5. Intentar POST manual a `/api/onboarding/owner/claim` con `academyId` ajeno y `userEmail` distinto → debe responder 403 `CLAIM_EMAIL_MISMATCH` sin tocar la academia objetivo.

Vault: actualizado `Changelog interno`. PR pendiente de autorización explícita del board antes de merge (regla común del AGENTS).

## 2026-07-31 - ZAL-64 preserva el registro owner en páginas de modalidad

- `src/app/(site)/[locale]/[modality]/page.tsx` mantiene el literal validado `Crear academia gratis` / `Create free academy` y cambia su destino común de `/contact?type=demo` a `/auth/register?role=owner`.
- Al ser un único CTA compartido por todas las modalidades, acrobática y trampolín reciben exactamente el mismo registro owner que artística y rítmica; no se añadió ningún CTA demo/contacto condicional para modalidades no soportadas.
- `tests/cluster-availability-metadata.test.ts` protege el destino de registro, la ausencia del destino demo anterior y ambos literales aprobados.
- Fuente: criterio 3 de `vault/04-Marketing/Brief - Copy acrobática y trampolín.md` (commit `d495ad31b`) y `vault/04-Marketing/Mensajes aprobados.md`. No se modificó copy público, pricing, checkout, contacto, migraciones ni servicios externos.
- Verificación local: contrato estático PASS para destino owner, ausencia del CTA demo y literales ES/EN. El test Vitest no arrancó porque falta `@testing-library/jest-dom/vitest`; `pnpm typecheck` no arrancó con dependencias completas (faltan, entre otras, `next` y `drizzle-orm`); `pnpm lint` quedó bloqueado porque el script anidado usa pnpm global 10.22.0 frente al 9.15.3 exigido y la invocación directa confirmó que falta `eslint`. Son bloqueos preexistentes del entorno, no fallos del CTA. Capturas Playwright pendientes de autorización explícita del board.

## 2026-07-30 - Gate de disponibilidad en clústeres país de acrobática y trampolín

- `src/app/(site)/[locale]/[modality]/[country]/page.tsx`: la disponibilidad se deriva de `AVAILABLE_MODALITIES`; para modalidades no disponibles, hero y metadata (incluidas keywords neutrales en ES/EN) usan el mensaje aprobado de “Próximamente”, se omiten los pain points y no se envían claims federativos al interlinking. Canonical y hreflang permanecen sin cambios.
- `src/components/landing/ClusterInterlinking.tsx`: los datos de federación y competiciones pasan a ser opcionales y el bloque solo se renderiza cuando ambos están presentes; los enlaces entre países y modalidades se conservan.
- `tests/cluster-availability-metadata.test.ts`: contrato enfocado que exige el gate de keywords y vocabulario neutral para modalidades no disponibles en español e inglés.
- Fuente de copy: `vault/04-Marketing/Brief - Copy acrobática y trampolín.md` en el commit `d495ad31b`; no se reescribieron los JSON de clúster ni la página madre de modalidad.

## 2026-07-30 - Verificación de `collect` detenida por dependencia de test faltante

- Se intentó revalidar `tests/api/charges-collect-handler.test.ts` con `corepack pnpm vitest run ...` usando la versión requerida por el repo (`9.15.3`).
- El arranque de Vitest falló antes de ejecutar tests porque el workspace no resuelve `@testing-library/jest-dom/vitest` desde `tests/setup.ts`.
- No se tocaron rutas de producción ni migraciones en esta pasada; el hallazgo queda como bloqueo de entorno de test, no de lógica de `collect`.
- El brief de convivencia legacy/canónico queda creado y actualizado como contexto operativo para la decisión de rutas.

## 2026-07-30 - Inventario inicial de convivencia `legacy dashboard` vs workspace canónico

- Se revisó la superficie pública y el header reutilizable para validar la decisión de compatibilidad vigente.
- Hallazgo útil: `events` ya usa destino canónico `/app/{academyId}/events` cuando `academyId` está disponible; `marketplace` y `empleo` siguen como excepciones globales porque no tienen equivalente canónico por academia en este workspace.
- No se introdujeron nuevas rutas públicas hacia `/dashboard/*` donde ya exista equivalente moderno por academia en esta pasada.
- Se actualizó `vault/01-Producto/Brief - convivencia legacy dashboard.md` con este inventario para reducir ambigüedad operativa.

## 2026-07-31 - Confirmación de excepciones públicas legacy

- Se releyeron las superficies públicas de `marketplace` y `empleo` y siguen publicando `dashboardHrefTemplate` hacia `/dashboard/marketplace/mis-productos` y `/dashboard/empleo/mis-postulaciones`.
- No existe equivalente canónico por academia en este workspace para esos dos destinos, así que permanecen como compatibilidad global temporal y no como regresión nueva.
- El resto de enlaces públicos ya usa rutas modernas o templates canónicos cuando existe destino por academia.
- Sin cambios de código en esta pasada. Vault: actualizado `Changelog interno`.

## 2026-07-29 - Brief de convivencia legacy `/dashboard/*` y workspace canónico

- Se creó `vault/01-Producto/Brief - convivencia legacy dashboard.md` para consolidar el alcance funcional de la decisión vigente sobre `legacy dashboard` vs `workspace` canónico.
- El brief deja explícitos: problema, buyer/dueño, recorridos por rol, estados esperados, criterios de aceptación, exclusiones, riesgos y evidencia necesaria.
- La decisión de producto sigue siendo la misma: compatibilidad temporal de seis meses para rutas legacy, redirección a `/app/[academyId]/*` cuando exista equivalente moderno y retirada física solo con evidencia de uso.
- Sin cambios de código ni migraciones en este heartbeat. Vault: actualizados `Brief - convivencia legacy dashboard` y `Changelog interno`.

## 2026-07-29 - ZAL-11 verificación Brevo: DKIM/return-path OK y entrega E2E confirmada; falta SPF en el ápex

Verificación hecha desde fuentes objetivas (DNS público + `email_logs` de producción), sin depender de acceso al panel de Brevo.

**1. Autenticación DNS de `zaltyko.com`**

| Registro | Estado | Valor observado |
|---|---|---|
| DKIM `brevo1._domainkey` | OK | CNAME → `b1.zaltyko-com.dkim.brevo.com` |
| DKIM `brevo2._domainkey` | OK | CNAME → `b2.zaltyko-com.dkim.brevo.com` |
| Propiedad de dominio | OK | TXT `brevo-code:157b92ef889dff5d2baca10073c7d5ef` en el ápex |
| Return-path / subdominio de marca | OK | `mail.zaltyko.com` CNAME → `mail-zaltyko-com.brand.brevosend.com`, con SPF propio `v=spf1 include:spf.brevo.com -all` |
| DMARC | Presente, sin enforcement | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |
| **SPF en el ápex** | **Ausente** | `zaltyko.com` no publica ningún `v=spf1` |

El SPF ausente en la raíz **no rompe la entrega**: el `MAIL FROM` es `mail.zaltyko.com`, que sí tiene SPF, y la alineación DMARC relajada se cumple por dominio organizacional; además DKIM firma con `d=zaltyko.com`. Queda como deuda de anti-spoofing en el backlog (Media / Terra).

**2. Evidencia E2E**

`email_logs` en producción (`aws-1-eu-north-1.pooler.supabase.com`):

- 3 filas `status='sent'`, plantilla `academy-invitation`, destinatario real externo (Gmail), `sent_at` 2026-07-28 17:36Z / 18:06Z / 18:22Z, `error_message` null.
- 2 filas `status='failed'` del 2026-07-17 con `El email 'replyTo' no es válido: Equipo Zaltyko <hola@zaltyko.com>`. Causa: `email-service.ts` pasaba `config.brevo.fromAdmin` (cadena con display name) a `replyTo`, que `src/lib/brevo.ts:47` valida con `isValidEmail` y rechaza. **Ya corregido** en el commit `72ef1f34` (`replyTo: process.env.BREVO_REPLY_TO ?? config.brevo.supportEmail`); los envíos correctos del 28 son posteriores al fix.

Los envíos correctos del 2026-07-28 prueban además que Vercel Production tiene las cuatro variables Brevo completas, ya que `getFeatureReadiness("email")` (`src/lib/env.ts:283`) exige `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` y `BREVO_REPLY_TO` y falla cerrado en producción si falta alguna.

**Conclusión:** los dos criterios de aceptación de ZAL-11 quedan satisfechos con evidencia, por lo que ZAL-1 deja de estar bloqueado por Brevo. Riesgo residual anotado: `BREVO_REPLY_TO` se lee crudo del entorno y solo se valida en el momento del envío, así que un valor con display name en Vercel volvería a romper todos los correos — es exactamente el fallo del 2026-07-17.

Sin cambios de código en este heartbeat. Vault: actualizados `Changelog interno` y `Backlog priorizado`.

## 2026-07-29 - ZAL-4 cobertura HTTP de rutas /api/family/payment-method y /api/family/charges/*

- Se añadió `tests/api-family-payments.test.ts` (38 tests, todos verdes) cubriendo los cinco handlers que ZAL-2 tenía sin cobertura HTTP directa:
  - `POST /api/family/payment-method/setup-intent`: validación Zod del body, 401 sin sesión, 403 sin perfil, 403 cuando `resolveFamilyPaymentAccess` deniega, 409 si la academia no está Connect-ready, flujo feliz que reusa customer + crea SetupIntent y devuelve `{clientSecret, publishableKey, stripeAccountId}`, 500 si `createFamilySetupIntent` lanza.
  - `GET /api/family/payment-method?academyId=...`: 400 con academyId no UUID, 401 sin sesión, 403 cuando el acceso de familia está denegado, `{hasCard:false, connectReady, card:null}` sin tarjeta, payload con brand/last4/expMonth/expYear cuando hay tarjeta, 500 si el servicio falla.
  - `POST /api/family/payment-method`: 400 body inválido, 401 sin usuario, 403 sin perfil, 409 si la academia no tiene Stripe Connect, guardado exitoso propagando `saveDefaultPaymentMethod` con academyId/profileId/paymentMethodId/stripeAccountId correctos, 500 ante excepción.
  - `DELETE /api/family/payment-method`: 400 academyId no UUID, 401 sin sesión, 403 acceso denegado, no-op con `{ok:true}` si la academia no tiene stripeAccountId (no llama `removeDefaultPaymentMethod`), desvinculación real cuando sí hay cuenta Connect, 500 ante excepción.
  - `POST /api/family/charges/[chargeId]/pay`: 401 sin sesión, 403 si `resolveFamilyChargeAccess` devuelve null, mapeo de `collectCharge` → 200 `{ok,status:'paid'}` | 409 `REQUIRES_ACTION` | 409 con reason cuando skipped | 402 con reason cuando failed, 500 ante excepción.
  - `GET /api/family/charges/[chargeId]/receipt`: 401 sin sesión, 403 acceso denegado, 404 si no hay fila en `receipts`, 404 si la fila existe pero `pdfUrl` es null, `{url, receiptNumber}` cuando hay pdfUrl, 500 ante excepción de DB.
- Mocks vía `vi.hoisted` para auth/profile/access/service states y para `next/headers`, `@/lib/supabase/server`, `@/lib/authz/profile-service`, `@/lib/family/payment-access`, `@/lib/stripe/family-customers-service`, `@/lib/stripe/charge-collection-service`, `@/lib/logger`, `@/db`, `@/db/schema` y `@/lib/env`. Sin red ni DB real.
- Validación: `vitest run tests/api-family-payments.test.ts` PASS 38/38 (2.5s). ESLint 0 errors / 0 warnings. `tsc --noEmit` sin errores nuevos en el archivo (los 513 errores preexistentes son todos de `mobile/*`, fuera del scope de ZAL-4).
- Sin cambios en código de producción, sin migraciones, sin tocar RLS ni `withTenant`. Las rutas usan el patrón ya documentado en la vault (auth vía cookies Supabase + `resolveFamilyPaymentAccess` / `resolveFamilyChargeAccess`, fuera de `withTenant`).
- Commit `4db12f26` incluye además archivos `mobile/*` que ya estaban staged en el índice desde runs previos (no introducidos por este cambio); el autor de esos archivos debe decidir si los quiere en este commit o en otro posterior.

Vault: actualizado `Changelog interno`.

## 2026-07-29 - ZAL-1 remitente confirmado por CEO; docs alineadas; verificación Brevo pendiente

- Tras respuesta del CEO a la interacción `ask_user_questions 0cedeccb` del issue [ZAL-1](/ZAL/issues/ZAL-1), el remitente transaccional de Brevo queda fijado en `hola@zaltyko.com` (alias `Equipo Zaltyko`, ya presente en `src/config.ts` como `fromAdmin`). `BREVO_SENDER_NAME=Zaltyko` y `BREVO_REPLY_TO=soporte@zaltyko.com` se mantienen sin cambios.
- Se actualizaron los ocho archivos de despliegue/desarrollo que listaban el placeholder histórico `BREVO_SENDER_EMAIL=noreply@zaltyko.com`: `docs/VARIABLES-VERCEL.md`, `docs/VERCEL-DEPLOYMENT.md`, `docs/VERCEL_ENV_VARIABLES.md`, `docs/DEPLOY-VERCEL.md`, `docs/DEPLOYMENT.md`, `docs/DEPLOY_NOW.md`, `docs/cicd-setup.md` y `docs/development-guide.md`. `docs/audit/ENVIRONMENT_AUDIT.md` ya documentaba el valor esperado `hola@zaltyko.com`, por lo que el cambio lo alinea.
- `src/lib/brevo.ts` y `src/lib/env.ts` no se tocan: ya leen `BREVO_SENDER_EMAIL`/etc. del entorno sin asumir un literal; `getFeatureReadiness("email")` (env:283) sigue exigiendo las cuatro variables Brevo y `sendEmail` (brevo:62-65) mantiene el fail-closed en producción (`EMAIL_NOT_CONFIGURED:*`).
- `.env.example` mantiene defaults genéricos (`admin@yourdomain.com`/`YourAppName`/`soporte@yourdomain.com`) — esos defaults nunca han sido los valores cargados en Vercel.
- Pendiente externo (CEO, no automatizable desde código): terminar la verificación del remitente en Brevo (DKIM/SPF/return-path sobre `hola@zaltyko.com`), actualizar el valor de `BREVO_SENDER_EMAIL` en Vercel Production/Preview si difiere, y enviar la evidencia E2E (`messageId` Brevo o `email_logs.status=sent`). El envío real se ejecutará tras el resto de bloqueos del no-go (Stripe Connect sandbox, KV/WAF/alertas), no ahora.
- Sin cambios en código, secretos reales, SQL, migraciones, RLS, dependencias, tests ni deploy. Vault: `Backlog priorizado.md` (línea 219) NO se ha movido a Resuelto porque la verificación sigue pendiente; se revaluará cuando llegue la evidencia de envío end-to-end.

Vault: actualizados `Changelog interno`.

## 2026-07-30 - Cierre reproducible de ZAL-31

- Se completó `tests/lib/stripe-refund-service.test.ts` conservando los tres tests originales y los cinco casos que ya estaban en `00f687f`; el archivo queda con 10 tests en dos bloques `describe`.
- Lista exacta de los `it(...)` incorporados por ZAL-31:
  - `it("es idempotente si el cargo ya estaba marcado como reembolsado")` dentro de `describe("refundCharge")`.
  - `it("rechaza importes cero o negativos")`.
- Se reforzó `it("acumula dos parciales y marca el cargo como reembolsado al completar el total")` para comprobar explícitamente que la primera operación usa `refund_charge_1_0_1500` y todavía no actualiza el cargo.
- Verificación local reproducible: `pnpm exec vitest run tests/lib/stripe-refund-service.test.ts` PASS, 10/10 tests en 1,69 s; `git diff --check -- tests/lib/stripe-refund-service.test.ts` PASS.
- Evidencia limitada a mocks locales (`vi.hoisted`/`vi.fn`) de Stripe, transacción, DB y auditoría. No se llamó Stripe sandbox/live, no se aplicó SQL remoto y no se ejecutó navegador, Playwright ni axe.

Vault: actualizado `Changelog interno`. No hay nueva decisión de producto, arquitectura o seguridad.

## 2026-07-23 - Inicio del cierre integral del mapa de objeciones

- Se creó `docs/plans/2026-07-23-objection-closure-matrix.md` como matriz canónica de las doce objeciones del director, con respuesta aprobada, capacidad, evidencia y estado de cierre.
- Se actualizó Inventario de producto, Onboarding y activación, Customer Success, Mensajes aprobados, Métricas y Backlog para permitir rediseño, simplificación, ampliación o sustitución de módulos cuando mejore adopción, claridad, accesibilidad, rendimiento, conversión o eficiencia operativa.
- Se corrigió una laguna funcional en `src/lib/analytics.ts`: los eventos emitidos desde APIs y servicios server-side ya no se descartan por no existir `window`; ahora se persisten en `growth_events` como fuente first-party, sin romper el flujo si falla la telemetría.
- Se reemplazaron testimonios públicos no respaldados por evidencia comercial actual por proof points de capacidades. FAQ pública ahora delimita migración histórica, seguridad, exportación y retención sin promesas absolutas.
- Se amplió el centro de ayuda con artículos de importación/exportación, roles/accesos y soporte.
- Se ajustaron claims públicos adicionales: sin cifras de academias, sin "configuración en 5 minutos", sin cumplimiento RGPD absoluto, sin migración histórica incluida y con Network claramente como multi-sede acompañada; el módulo de competiciones ya no promete listados federativos perfectos ni elegibilidad automática sin revisión.
- Validación: ESLint focalizado PASS; TypeScript alternativo `tsc --types node` PASS después de corregir el cron. `pnpm typecheck` continúa bloqueado por el paquete vacío/symlink roto `@types/eslint-scope` en `node_modules`. Las suites focalizadas de comunicación, contratos de producción y leases pasan 16/16.
- Validación posterior: `pnpm test -- --run` PASS con 103 archivos y 674 tests; `pnpm lint` PASS; auditor estricto de APIs PASS (`risky=[]`, `semanticRisks=[]`, `resourceScopeManualReview=0`).
- Se actualizó Next.js de `15.5.19` a `15.5.21` por tres advisories high; el gate de dependencias queda PASS con solo 1 low y 1 moderate. `pnpm verify:production` completo PASS: autorización, RLS 69/69, env, dependencias, ledger 6+42, TypeScript, lint, 103/674 y build Next de 224 páginas.
- Se consolidaron las rutas de soporte `/api/support/tickets`, `/api/support/tickets/[id]` y `/api/support/tickets/[id]/responses`: dejan de depender de joins Supabase legacy con `fullName/email`, usan el esquema Drizzle real, `withTenant`, Zod y respuestas estandarizadas. Se mantienen los estados, permisos por academia, respuestas internas de super-admin y cierre seguro de tickets.
- Verificación posterior a soporte: auditoría API 294 rutas (`zodValidated=180`, `standardizedResponse=258`, `standardizedErrors=260`, `risky=[]`, `semanticRisks=[]`), TypeScript/lint/tests/build PASS y `pnpm verify:production` PASS completo.
- No se aplicaron migraciones, no se tocaron sistemas externos, no hubo deploy ni se fabricaron datos comerciales. El cierre funcional y la validación humana del mapa continúan en progreso.

Vault: actualizados `Changelog interno`, `Inventario de producto`, `Onboarding y activación`, `Customer Success`, `Mensajes aprobados`, `Métricas` y `Backlog priorizado`.

## 2026-07-18 - Cierre técnico Día 4 y pase seguro a Día 5

- Gate de producción completo verde: inventario estricto de 293 APIs sin `risky` ni `semanticRisks`, RLS declarada 69/69, integridad de 6 migraciones Drizzle + 40 Supabase, TypeScript, ESLint, 90 archivos y 640/640 tests, y build Next.js 15.5.19 con 219 páginas estáticas generadas.
- Se corrigió el bucle `/help` → `/ayuda` → `/{locale}/ayuda` retirando del middleware la localización de las rutas públicas canónicas; la regresión cubre `/ayuda` y `/sobre-nosotros` con navegador en inglés.
- El alias legacy `/app/[academyId]/evaluations` salió del smoke genérico y tiene un contrato E2E explícito: redirige a `/app/[academyId]/assessments`, muestra `#main-content` y no expone errores de ruta. Resultado final sin retries: Chromium, Firefox y WebKit, 3/3.
- Se estabilizó el harness local sin aumentar timeouts funcionales indiscriminadamente: Vitest y el gate usan dos workers; Playwright autenticado usa un worker local, espera hidratación real y diferencia enlaces visibles de duplicados responsive. La sesión E2E owner se renovó sin provisionar usuarios ni mutar datos.
- El intento deliberado contra `next start` confirmó el fail-closed de producción: sin Vercel KV la ruta privada devuelve 429 antes del redirect. No se desactivó la protección. KV/WAF/paridad Vercel, entrega Brevo y la matriz Stripe externa continúan como bloqueos operativos para producción.
- `src/components/landing/ClusterStatsSection.tsx`, archivo nuevo presente en el árbol compartido, recibió el contrato de tipo mínimo de `socialProof` necesario para restaurar TypeScript/build; no se añadieron claims ni datos comerciales.
- Decisión de cierre: es seguro iniciar el trabajo de Día 5 sobre el código local. Esto no autoriza deploy ni cambia el no-go de producción mientras falten KV y las validaciones externas pendientes.
- Vault: actualizados `Changelog interno`, `Registro de riesgos` y `Backlog priorizado`; evidencia técnica sincronizada en `docs/audit/SPRINT_01_PLAN.md` y `docs/audit/CRITICAL_FLOWS.md`. No hubo nueva migración ni decisión de producto.

## 2026-07-16 - Día 4: hardening transaccional local

- Stripe Connect valida cuenta conectada, tenant, academia, importe, moneda y metadata antes de reconciliar; firma con body raw y tolerancia explícita. Refunds usan transacción, advisory lock, límite acumulado e idempotencia estable. El método de pago familiar debe pertenecer al Customer canónico.
- Invitaciones y solicitudes de vínculo usan claim atómico para impedir doble aceptación; roles custom se aplican realmente, las URLs salen del origen configurado y el correo se registra con deduplicación. Tokens siguen almacenados en claro y quedan en backlog para migración compatible.
- Los siete cron auditados usan lease; `scheduled-notifications` admite `GET`, no marca éxitos falsos y deja de registrar teléfono/contenido WhatsApp. Brevo y KV fallan cerrados en producción cuando falta configuración.
- Mailgun inbound exige HMAC reciente y escapa todo el contenido; queda pendiente nonce ledger. Se añadieron pruebas focalizadas de webhooks, refunds, expiración/replay, lease y readiness.
- Gate local final: typecheck y lint verdes; Vitest 90 archivos/638 tests; auditor estricto 292 rutas sin riesgos; RLS 69/69; integridad 6 Drizzle + 40 Supabase; `git diff --check` limpio.
- Sin cargos reales, cambios de webhook/Vercel, SQL, usuarios, datos, Playwright/axe, deploy ni archivos eliminados. Se revisó el changelog reciente de Supabase y Día 4 no necesitó migración.
- Vault: actualizados `Changelog interno`, `Backlog priorizado` y `Registro de riesgos`; no hubo una nueva decisión de producto/arquitectura que registrar.

## 2026-07-16 - Cierre seguro Día 2 + Día 3 y pase a Día 4

- Las suites API sensibles antes excluidas se actualizaron e incorporaron a `vitest.config.ts`: atletas, clases/sesiones/asistencia, billing legacy 410, Stripe/webhooks, auth completa, límites y tenancy. El gate normal y `pnpm test:security` pasan 86 archivos y 618/618 tests, sin exclusiones ni skips Vitest.
- Se corrigió una pérdida real de `context.params` en 17 llamadas rate-limited de 10 Route Handlers; una regresión estática impide volver a invocar el handler interno con contexto vacío. La resolución de rate limit ordena prefijos por especificidad, por lo que `/api/athletes/import` conserva 5/min frente al límite general 60/min.
- `pnpm test:rls:local` aplica conjuntamente `20260716181006_day2_rls_semantic_hardening.sql` y `20260716214500_day3_communication_academy_scope.sql` en PostgreSQL efímero. Owner, coach, parent, athlete, viewer, super-admin y anon pasan; 102 tablas públicas, 0 sin RLS; rollback y cluster borrado al finalizar.
- El ensayo real detectó que un `CASE` no basta para impedir planificación de helpers privados con `anon`; las tres policies SELECT de comunicación ahora declaran `TO authenticated` y la regresión anónima cubre templates, groups y scheduled notifications.
- Gate de release local completo verde: 292 rutas (`risky=[]`, `semanticRisks=[]`, `resourceScopeManualReview=0`), RLS 69/69, migraciones 6 Drizzle + 40 Supabase, typecheck, lint, 618/618 tests y build Next.js 15.5.19 de 219 rutas. `git diff --check` limpio.
- No se ejecutó Playwright/axe, no se usaron cuentas reales, no se aplicó SQL remoto y no hubo deploy. Es seguro comenzar Día 4; producción sigue no-go hasta promoción revisada, PostgREST/Realtime, sandbox externo y readiness de KV/env.
- Vault: actualizados `Changelog interno`, `Backlog priorizado`, `Registro de riesgos`, `Runbook migraciones` y `Decisiones`; documentación técnica sincronizada en `docs/audit/`.

## 2026-07-16 - Día 3 de hardening: matriz de capabilities y resource scope

- `scripts/audit-api-routes.ts` evolucionó de clasificador de imports a inventario ejecutable por método: auth, capability, Zod/equivalente, rate limit, academia, resource scope, service role, `tenantId` de cliente, datos sensibles y denegación. Snapshot final: 292 rutas, 171 capability-protected, 176 validadas, 254 respuestas y 256 errores estándar; cero `risky`, cero riesgos semánticos y cero scopes manuales.
- Se ampliaron capabilities para dominios sensibles y se corrigieron cuatro brechas concretas: owner/admin global ya no equivale a ownership de academia en helpers coach/recurso; `/api/athletes` deja de aceptar override de tenant; tres llamadas de cobros/grupo dejaron de invertir tenant y academia; vídeos de evaluación validan academia, atleta/asignación y envelope.
- Se cerraron los 32 recursos dinámicos con helpers de academia/clase/atleta y scopes explícitos self/guardian/super-admin. Evidencia focalizada final: 49/49 PASS, incluida negativa BOLA academia A/B, tenant, clase y atleta no asignado.
- Gate obligatorio final: typecheck, lint, 68 archivos/527 tests, auditor estricto, RLS 69/69, integridad 6+40 y `git diff --check` PASS.
- Comunicación queda aislada por academia en schema, servicios, UI y Route Handlers. Se versionó `20260716214500_day3_communication_academy_scope.sql` con backfill solo inequívoco y RLS; no se aplicó. Se revisó antes el changelog oficial reciente de Supabase.
- En este snapshot se detectó deuda histórica de envelopes/mocks, endpoints billing deprecated, Stripe y TSX; el cierre posterior del mismo día, registrado arriba, la reparó e integró y cerró ROLE-003. ROUTE-004 y MT-004 ya estaban cerrados aquí.
- No se tocó producción, no se aplicó SQL, no se provisionaron usuarios, no se ejecutó Playwright/axe y no se eliminaron archivos.
- Vault: actualizados `Changelog interno`, `Registro de riesgos`, `Backlog priorizado`, `Runbook migraciones` y `Decisiones`.

## 2026-07-16 - Día 2 de hardening: RLS semántico, TLS, pool y build offline

- Se inventariaron las 69 tablas tenant-scoped por identidad, menores/deporte, billing, comunicación, eventos y diagnóstico, además de tablas cuyo scope llega por FK. El mapa CRUD/rol/recurso/browser queda en `docs/audit/RLS_SEMANTIC_MATRIX.md`.
- La migración pendiente `20260716181006_day2_rls_semantic_hardening.sql` crea diez helpers escalares en `zaltyko_private`, fija `search_path=pg_catalog`, cualifica objetos, revoca `EXECUTE` de `PUBLIC/anon` y elimina el helper que devolvía un perfil completo. `plans_read` deja el helper de rol obsoleto y usa `TO authenticated`.
- Policies core separan owner/academia, coach asignado, parent por `guardian_athletes`, athlete por `athletes.user_id`, viewer y superadmin. Cobros solo son visibles para manager o tutor vinculado; athlete/coach/viewer quedan fuera.
- El cierre integral detectó diez catálogos deportivos globales en `public` sin RLS. La misma migración pendiente habilita RLS, deja lectura solo para `authenticated`, revoca acceso `anon` y escrituras browser, y mantiene el backend privilegiado como único escritor. `verify:permissive-policies` ahora falla ante cualquier tabla pública sin RLS salvo `__drizzle_migrations`.
- La primera prueba PostgreSQL detectó recursión real entre tutores y vínculos; se corrigió con helper privado. La repetición desde cero pasó para owner A/B, coach asignado/no asignado, parent propio/otro menor, athlete, viewer, anónimo, superadmin y `tenant_id` falso. El clúster semántico es efímero y termina en rollback. La única conexión productiva del cierre fue el auditor de metadatos read-only; no consultó filas de producto ni ejecutó SQL mutante.
- Runtime PostgreSQL remoto ahora exige `NODE_EXTRA_CA_CERTS` y valida el certificado. El ledger y el script manual de precios Stripe reutilizan la misma configuración fail-closed; no queda `rejectUnauthorized:false` en `src/`, `scripts/` ni Drizzle. Pool por instancia baja de 50 a 5 (configurable); no se afirma capacidad global sin métricas.
- El perfil público de coach pasa a `force-dynamic` y elimina `generateStaticParams` con DB. Durante `NEXT_PHASE` cualquier acceso DB falla antes de abrir socket; CI build deja de definir una URL PostgreSQL placeholder.
- Verificación final: PostgreSQL RLS aislado PASS con rollback; contrato estático PASS (10 helpers, 26 tablas, 9 escenarios); RLS declarada 69/69; migraciones 6 Drizzle + 39 Supabase; auditor API 292 rutas/0 riesgosas; policies permisivas sin globales no aprobadas; typecheck, lint y `git diff --check` limpios; `pnpm exec vitest run` exacto PASS (66 archivos/513 tests) después de fijar el presupuesto estable de 4 workers en la configuración; build offline sin URL DB PASS con 219 rutas. Ledger dry-run: una única migración pendiente, SHA-256 `1c7a83bad89a7b436798097f896486769cf833e40b76768f8624a801fbd9de84`.
- La migración no se aplicó; quedan dominios tenant-wide secundarios y PostgREST local antes de cerrar MT-002/003/DB-005 por completo. No hubo SQL mutante, seed, deploy, commit ni push.
- Vault: actualizados `Changelog interno`, `Registro de riesgos` y `Backlog priorizado`; no se añadió una decisión nueva porque la autoridad global exclusiva de `super_admin` ya era contrato vigente del Día 1.

## 2026-07-16 - Radiografía técnica integral (solo documentación)

Se auditó el árbol de trabajo completo en `main` sobre `1e3cb8ff8ae1274e72ef47d81be3096c3b18d1a3`, preservando los cambios sin commit. Se crearon los 13 documentos de `docs/audit/` y seis capturas locales/productivas read-only. No se modificó lógica, esquema ni datos.

Hallazgo bloqueante: el registro de permisos de `withTenant` solo deniega a un miembro no-owner cuando existe `roleId`; los roles baseline `coach`/`viewer` sin rol personalizado pueden atravesar rutas con `requiredPermission`. Además, el RLS tenant-wide requiere pruebas semánticas por guardian/self/coach: la cobertura declarada 69/69 no demuestra mínimo privilegio dentro de una academia. Se registran también TLS DB sin validación CA, rate limit fail-open sin KV, drift de entorno, redirección local de `/` con overflow y siete fallos Vitest.

Baseline final: `lint`, `typecheck` secuencial, `build` (219 páginas), auditor API estricto (292 handlers), RLS declarado y migraciones (6 Drizzle + 38 Supabase) pasan; Vitest 472/479. `pnpm audit --prod --json` no fue concluyente porque el endpoint legacy respondió HTTP 410. El plan de siete días y el gate no-go hasta cerrar P0 están en `docs/audit/SPRINT_01_PLAN.md` y `TECHNICAL_ROADMAP.md`.

## 2026-07-15 - Cierre de producción, email transaccional y documentación

El despliegue de `be946c21` quedó publicado en producción mediante el deployment de GitHub `5461247293` (`success`). `NEXT_PUBLIC_APP_URL=https://zaltyko.com` quedó configurada en Vercel Production; `zaltyko.com` responde con canonicals, `og:url`, sitemap y robots exclusivamente canónicos, sin referencias al dominio `vercel.app`.

Se corrigieron los formularios públicos de contacto de eventos y academias: ahora entregan el mensaje a su destinatario mediante Brevo, usan `Reply-To` del remitente y escapan el contenido HTML. Se actualizó la documentación de despliegue, soporte, arquitectura, checklist e integraciones para reflejar Brevo como proveedor activo; Mailgun queda únicamente como webhook inbound legado compatible.

Verificación final: `pnpm typecheck`, `pnpm lint`, `pnpm test -- --run` (59 archivos, 477 tests, más 2 tests unitarios nuevos de escape HTML), `pnpm build` (219 páginas) y smoke HTTP en producción, todos correctos. Se eliminó un deployment manual duplicado que había quedado atascado sin alias.

**Verificación de email (2026-07-15)**: el valor local de `BREVO_API_KEY` coincide con el placeholder de `.env.example`; la API de Brevo devolvió HTTP 401. Se retiró de Vercel Production para no activar una credencial inválida. Falta que operaciones proporcione una clave real y un remitente verificado; no se registra ningún secreto en la bóveda.

**Stripe Connect (2026-07-15)**: el webhook live ya estaba registrado y activo en Stripe Workbench (`https://zaltyko.com/api/stripe/connect/webhook`) con `account.updated`, `charge.refunded`, `payment_intent.canceled`, `payment_intent.payment_failed` y `payment_intent.succeeded`. No se creó un endpoint duplicado. El QA E2E en test mode queda documentado abajo; todavía no se ejecutan cargos live.

**QA E2E Stripe Connect test mode (2026-07-15)**: ejecutado con `sk_test_` contra la cuenta Standard `acct_1TtTOdD6epI0CHnR`. `charges_enabled=true`, `payouts_enabled=true`, `details_submitted=true`; se generó un Account Link de onboarding. SetupIntent con `tok_visa` y PaymentIntent off-session finalizaron `succeeded`; reembolso finalizó `succeeded`. El caso `tok_chargeDeclined` devolvió `card_declined` y el caso `tok_threeDSecure2Required` devolvió `authentication_required`/`requires_action` (SCA). Stripe Test API mostró eventos `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `setup_intent.succeeded` y `setup_intent.requires_action`. Tests de servicio/reconciliación: 19/19. No se hicieron cargos reales ni se modificó el ledger de producción. Pendiente: repetir QA con credenciales live aprobadas y comprobar entrega del webhook live en Vercel.

## 2026-07-15 - Cierre CRO/SEO y coherencia de integraciones

Los nueve commits de CRO/marketing (`45d7048e`, `7980aff1`, `715d7aae`, `b5541a2a`, `b7fbf4b7`, `a34dfd40`, `e8f26139`, `b9e04d4c` y `d862e4b9`) quedaron integrados mediante PR #37 (`793d7eb4`). Se corrigieron páginas públicas, copy de academias/coaches, trust line del trial y canonical de auth.

Después de verificar producción se cerraron en código los huecos que sí eran responsabilidad del repositorio: helper `getPublicSiteUrl()` para impedir que Vercel o túneles aparezcan como canonicals, canonicals App Router para directorios, ayuda, FAQ, eventos, marketplace, empleo y auth, `FAQPage` JSON-LD en `/faq` y `/ayuda`, y sitemap ampliado con `/coaches` y `/faq`. La página de integraciones ahora identifica correctamente Brevo (no Mailgun) y deja explícito que WhatsApp externo sigue sujeto a validación del proveedor; la comunicación interna continúa siendo la prioridad v1.

**Pendiente externo, no simulado**: Stripe Connect live continúa bloqueado hasta registrar el webhook y ejecutar QA de cobros, SCA/3DS y reembolsos con credenciales autorizadas. La corrección SEO de Vercel quedó aplicada y verificada.

## 2026-07-15 - Módulo "Cobros y cuotas" con Stripe Connect Standard (10 fases)

Construye la capa de cobro real sobre el ledger `charges` existente, manteniendo a la academia como merchant of record y a Zaltyko fuera de la custodia de fondos y de lo fiscal. Arquitectura: **Stripe Connect Standard + direct charges + tarjeta Stripe-hosted + ledger `charges` como fuente de verdad**. Bizum/efectivo/transferencia siguen como pago manual.

**Mergeado y desplegado a producción**: PR #36 (`e28466b6`, tras redeploy por OOM transitorio del build en plan Hobby) y PR #37 (`793d7eb4`, deploy limpio a la primera). `zaltyko.com` sirve la versión completa incluidos los dos fixes de QA.

**QA end-to-end real contra Stripe Connect test mode** (no mockeado, 2026-07-15): servidor local + túnel `cloudflared` + webhook de test registrado vía script. Se conectó de verdad una cuenta Connect Standard (`acct_1TtTOdD6epI0CHnR`) contra la academia real "MentesSaas Academy" (con consentimiento explícito del usuario, dado que no existe DB de desarrollo separada — la app apunta siempre a producción). Onboarding completo con identidad simulada (test mode) y banco de prueba de Stripe; verificado en DB: `charges_enabled=true, payouts_enabled=true, details_submitted=true`.

**Bug real encontrado y corregido en el QA** (PR #37): el `return_url`/`refresh_url` del account link apuntaba a `/app/{academyId}/billing`, pero `StripeConnectCard` (que dispara el refresco automático de estado al volver de Stripe) solo está montado en `/app/{academyId}/settings`, pestaña Cobros. Cualquier academia real que completara el onboarding habría aterrizado en la página equivocada sin ver el estado actualizado. Corregido: return_url ahora apunta a `/settings`, y la pestaña Cobros se activa automáticamente si llega `?connect=return|refresh`.

**Efecto colateral**: el mismo PR también corrigió un error de tipos preexistente y ajeno a este módulo (`ProblemSectionProps.content` debía ser opcional, `src/app/(site)/modules/components/ModuleSections.tsx`) que bloqueaba el CI para cualquier PR — quedó roto en `main` por una sesión concurrente distinta a esta.

**Deuda que sigue sin poder cerrarse desde aquí**: falta correr `scripts/register-connect-webhook.ts` contra Stripe **live** y pegar `STRIPE_CONNECT_WEBHOOK_SECRET` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live) en Vercel Production — son secretos, el usuario debe pegarlos él mismo. Hasta entonces, el webhook de Connect en producción no está registrado y la reconciliación de pagos reales dependerá solo del endpoint `/refresh` manual, no de eventos push. QA de cobro con tarjeta (SetupIntent, PaymentIntent, SCA, rechazo, reembolso) quedó pendiente tras validar el onboarding — no se llegó a esa parte por los límites de tiempo/entorno de esta sesión.

- **FASE 1 — Infra Connect**: tabla `stripe_accounts` (Drizzle + `supabase/migrations/20260714120000_*`, RLS tenant). `src/lib/stripe/connect-service.ts` (crear/obtener cuenta conectada, AccountLink de onboarding, sync de estado). Endpoints `POST /api/payments/connect/onboard|refresh`, `GET /status`. Webhook de cuentas conectadas `/api/stripe/connect/webhook` (`account.updated`), idempotente vía `billing_events`. **Eliminada la config falsa de pagos**: `/api/payments/configure` deprecado (410) y formulario BYO-keys quitado de Ajustes (API + UI + `academy-settings-model`). Nuevo `StripeConnectCard`.
- **FASE 2 — Tarjetas de familia**: tabla `family_stripe_customers` (customer por academia+profile en la cuenta conectada; solo `brand/last4`, nunca PAN). `family-customers-service.ts` (SetupIntent off-session, guardar/quitar método). Endpoints `POST /api/family/payment-method/setup-intent`, `GET/POST/DELETE /api/family/payment-method`. `FamilyPaymentMethodCard` con Stripe Elements sobre la cuenta conectada.
- **FASE 3 — Ledger**: `charges` += `stripePaymentIntentId/stripeChargeId/stripeAccountId/attemptCount/lastAttemptAt`; `chargeStatusEnum` += `failed/refunded`; `paymentMethodEnum` += `card`. UI de estados nuevos.
- **FASE 4 — Motor de cobro**: `charge-collection-service.ts` (`collectCharge`: PaymentIntent off-session sobre cuenta conectada, advisory lock por cargo, idempotency key por (cargo,intento), actualización del ledger). Tabla `payment_attempts`. `POST /api/charges/[id]/collect`.
- **FASE 5 — Webhooks de pago**: `charge-reconcile-service.ts` reconcilia `payment_intent.succeeded/payment_failed/canceled` y `charge.refunded` de forma condicional (no pisa pagado/reembolsado, tolera fuera de orden).
- **FASE 6 — Portal padres**: `MyPaymentsWidget` con "Pagar ahora", tarjeta guardada, recibo, estados failed/refunded. `POST /api/family/charges/[id]/pay`, `GET /api/family/charges/[id]/receipt`.
- **FASE 7 — Recordatorios**: `triggerScheduledPaymentReminders` (ventanas -3/0/+3/+7 días) + cron `/api/cron/payment-reminders` (registrado en `vercel.json`, 09:30). Corrige la ausencia de recordatorios programados.
- **FASE 8 — Dashboard financiero**: `collection-stats.ts` (agregación en una query) + `GET /api/billing/collection-stats` + `CollectionStatsCard` en la pestaña de cargos.
- **FASE 9 — Reembolsos**: tabla `refunds`, `refund-service.ts` (Stripe refund sobre cuenta conectada, marca `refunded`, auditoría), `POST /api/charges/[id]/refund`.
- **FASE 10 — Hardening**: cobro automático programado `/api/cron/collect-charges` (recorre academias con Connect listo, cobra cargos vencidos con tarjeta — la promesa central). Botones de dueño "Cobrar tarjeta"/"Reembolsar" en `StudentChargesTab`. Docs (`docs/COBROS_Y_CUOTAS.md`). Fix menor de tipos en `scripts/verify-public-claims.ts`.

**Estado de verificación**: `pnpm typecheck` en verde, ESLint sin errores nuevos, `vitest run` 462/462 (incluye 7 nuevos de `mapOnboardingStatus/isConnectReady`). **NO verificado end-to-end contra Stripe real** (requiere claves live/test y una cuenta Connect): onboarding, cobro off-session, SCA/3DS, webhooks y reembolsos necesitan QA en sandbox antes de producción. **Migraciones NO aplicadas a la DB real** (5 nuevas: stripe_accounts, family_stripe_customers, extend charges, payment_attempts, refunds) — ejecutar el runner de migraciones antes de usar. Env nuevas: `STRIPE_CONNECT_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

**Deuda resuelta (mismo día, tras las 10 fases)**:

- `/api/me/charges` (bearer/móvil) **reescrito**: usaba columnas inexistentes (`first_name/last_name`, `guardians.user_id`, `charges.amount/description/paid_date`, `profiles.academy_id`). Ahora identifica al usuario por bearer y lee con Drizzle server-side (`getFamilyChildrenForUser` + atleta propio por `athletes.userId`), con columnas reales (`name`, `amountCents`, `paidAt`, `guardian_athletes`).
- **LemonSqueezy eliminado** (código muerto): borrados `src/utils/lemon.ts`, `src/components/lemon-button.tsx`, `src/app/api/lemonsqueezy/webhook/`; retiradas las env `LEMONSQUEEZY_*` y la entrada de rate-limit (sustituida por `/api/stripe/connect/webhook`).
- **Descuento por hermanos**: `discountCategoryEnum += 'sibling'` (migración `20260715120000_*`) + tipo en `discount-calculator`.

**Migraciones APLICADAS a producción (2026-07-15)**: las 6 migraciones de este módulo se aplicaron contra la DB real de Zaltyko (Supabase `jegxfahsvugilbthbked`, proyecto Vercel `zaltyko`/`zaltyko.com`), confirmado explícitamente por Elvis tras verificar que no había DB de staging separada. Ejecutado con el runner sancionado `pnpm db:migrate:ledger --apply` (transacción única, rollback automático si falla). Verificado post-aplicación directamente contra la DB (no solo el mensaje del script): 4 tablas nuevas (`stripe_accounts`, `family_stripe_customers`, `payment_attempts`, `refunds`) con RLS habilitado, 5 columnas nuevas en `charges`, `charge_status` += `failed`/`refunded`, `payment_method` += `card`, `discount_category` += `sibling`. `pnpm db:migrate:ledger` final: **38 migraciones verificadas, 0 pendientes**.

**Mergeado y desplegado a producción (2026-07-15)**: PR #36 mergeado a `main` (merge commit `e28466b`). El primer build de Vercel falló por OOM (plan Hobby, presión de memoria de la máquina compartida; producción se mantuvo sana en el deploy anterior #35 mientras tanto); un redeploy compiló bien (Ready, 7m 53s) y `zaltyko.com` sirve la versión con el módulo. Verificado: home/pricing 200. Las tablas nuevas siguen vacías; ninguna academia ha conectado Stripe aún.

**Deuda que sigue sin poder cerrarse en código** (requiere accesos externos): definir en Vercel Production `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` y `STRIPE_CONNECT_WEBHOOK_SECRET`; registrar el webhook de Connect (`scripts/register-connect-webhook.ts https://zaltyko.com`); QA E2E en Stripe test mode (onboarding, cobro, SCA/3DS, reembolso). Hasta que Vercel tenga la publishable key, los Elements del portal de familias no cargarán; hasta registrar el webhook + su secret, el estado de las cuentas conectadas se sincroniza solo vía el endpoint /refresh, no por webhook. `application_fee` = 0 es decisión de producto (monetización futura opcional), no deuda.

## 2026-07-14 - Aplicación de fixes CRO sobre la landing `/`

- **Accesibilidad (hero + navbar + email capture)**:
  - `Navbar.tsx`: el CTA "Crear cuenta gratis" ahora es visible en móvil con texto corto "Crear cuenta" y el burger mantiene su accesibilidad (`min-h-[44px]`, `aria-label`). El enlace "Iniciar sesión" pasa a `hidden sm:inline` para no comprimir el header en pantallas estrechas.
  - `HeroSection.tsx`: H1 pasa a `text-[clamp(1.875rem,6vw,4.5rem)]` para que el titular se mantenga legible entre 360 px y 1440 px sin saltos bruscos. Subtítulo reescrito de "Sin Excel y sin 14 chats de WhatsApp" a "Sin Excel y sin los chats de WhatsApp del club" (sin número fabricado).
  - `EmailCapture.tsx`: añadido `useId`, `name="email"`, `autoComplete="email"`, `inputMode="email"`, `aria-required`, `aria-invalid` y `<label className="sr-only">`. Nueva prop opcional `submitHref` para fallback nativo a `/auth/register?role=owner` con `?email=` si el JS falla.
- **Comparativa única** (Quick Win #5 del `LANDING-CRO.md`):
  - `WhyZaltykoSection.tsx` eliminado (`git rm`). Las dos tablas se fusionan en `ComparisonSection.tsx`, que ya estaba actualizada con `comparisonFeatures` aprobado ("Migración desde Excel incluida", "Pase de lista por sesión", "Reportes para dirección", "Evaluaciones con rúbrica", "7 días de Starter sin tarjeta", etc.).
  - `page.tsx` pierde el import y el `<WhyZaltykoSection />`. `src/app/(site)/home/index.ts` también elimina el export del barrel para no dejar dangling reference.
- **Módulos reordenados**: `ModulesSection.tsx` pone Cobros primero (con `lg:col-span-2` y lead "Lo que más usan las directoras"), seguido de Clases, Comunicación, Gimnastas, Eventos, Evaluaciones, Reportes y Multi-Sede. Imports no usados (Bell, Globe, TrendingUp, FileText) retirados para mantener limpio el barrel.
- **Clusters SEO colapsados**: `ClusterDiscoverySection.tsx` envuelve la matriz completa de país × modalidad en `<details>` con resumen "Explorar todas las combinaciones de país y modalidad". Se elimina el claim fabricado de "52 páginas específicas por país y modalidad" y se sustituye por "Contenido adaptado a tu federación, categorías y competiciones locales". Aria-labels añadidos a los enlaces y a los flags decorativos.
- **FAQ actualizado y schema alineado**:
  - `FaqSection.tsx`: pregunta de cancelación sustituida por la de cumplimiento de protección de datos de menores ("Sí. Zaltyko aísla los datos por academia, registra consentimientos firmados por las familias..."), con `openIndex` inicial en `1` (tiempo de configuración) para no repetir el orden del schema.
  - `page.tsx` (FAQPage JSON-LD): reescrito con las 8 preguntas actuales y en el mismo orden que la UI. Se retira "¿Mis datos están aislados de otras academias?" (ya no visible) y se añade "¿Sirve si ahora trabajo con Excel o WhatsApp?" y la de RGPD.
- **Decisión sobre el form final**: `FinalCtaSection.tsx` mantiene el `EmailCapture` secundario como newsletter / soft-CTA (POST a `/api/leads`), distinto del CTA principal que ya va a `/auth/register?role=owner`. No se duplica el flujo de registro para no fragmentar tracking de growth.
- **Validación**: `pnpm typecheck` y `pnpm lint` limpios; `pnpm build` compila sin errores (la landing `/` sigue renderizando como ruta estática). Capturas de la home renderizada en `/tmp/zaltyko-shots/` (desktop-hero, desktop-full, mobile-hero, mobile-full) confirman que el CTA móvil es visible, el H1 se ajusta al ancho y los bloques colapsados se muestran sin scroll en mobile.
- Vault: `LANDING-CRO.md` actualizado a 78/100 con Plan, Prioritized Fix List y Before/After Wireframes; este changelog y `Auditoria producto-CRO-SEO 2026-07-13.md` referenciado.

## 2026-07-13 - Cierre de deuda de seguridad: cron y policies globales auditables

- `requireCronAuth()` conserva el contrato oficial de Vercel Cron (`Authorization: Bearer $CRON_SECRET`), pero ahora compara hashes SHA-256 con `timingSafeEqual`; secreto ausente, bearer inválido o header malformado siguen fallando cerrados. No se añadió una whitelist IP ni un header de procedencia como identidad: no son una prueba criptográfica y Vercel ya autentica el cron con el secreto.
- `pnpm verify:permissive-policies` carga `.env.local`/`.env`, exige la CA configurada para Supabase remoto y consulta `pg_policies` en modo solo lectura. Producción tiene diez lecturas globales revisadas de catálogo/listados públicos y **cero** policies globales no aprobadas; cualquier `allow_authenticated`, escritura global o `USING true` no aprobado falla el comando.
- Se cerraron los pendientes 4.5 y de policies permisivas en el backlog. No se aplicó migración ni seed: la corrección de policies ya estaba viva y se añadió un control de regresión.
- Validación: `tests/audit-hardening.test.ts` 13/13, `verify:permissive-policies` con 0 policies no aprobadas, lint y typecheck pasan.
- Vault: `Decisiones`, `Backlog priorizado`, `Registro de riesgos` y este changelog.

## 2026-07-13 - Cierre operativo: despliegue Git de Vercel sin falso rojo en GitHub Actions

- El workflow `Deploy` de GitHub ya no intenta usar la CLI de Vercel cuando faltan sus tres secretos de operación (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Un job de readiness no imprime valores y deja el deploy opcional como `skipped`; así el pipeline no informa un fallo que no representa al despliegue real por integración Git de Vercel.
- Cuando los tres secretos se configuren en GitHub, la ruta existente de `vercel pull/build/deploy` seguirá ejecutándose sin cambios. No se crearon ni rotaron secretos y no se alteró el despliegue automático de Vercel.
- Se actualizó `Estado actual de Zaltyko` con el cierre técnico: ledger SQL de 32 migraciones, limitación de mutaciones solo tras verificar tenant y corrección del empaquetado de `/api/docs` en Vercel.
- Validación local: formato YAML/Prettier, lint y typecheck pasan; el siguiente push a `main` debe mostrar el workflow alternativo como `skipped` mientras los secretos no estén configurados.
- Vault: `Estado actual de Zaltyko` y este changelog.

## 2026-07-13 - Corrección de entrega de OpenAPI en Vercel

- El smoke posterior al despliegue detectó que `GET /api/docs` devolvía 404 aunque la ruta compilaba localmente. La causa era la regla amplia `docs` en `.vercelignore`: también excluía `src/app/api/docs` de la subida a Vercel.
- Se ancló la exclusión a `/docs/`, preservando la documentación raíz sin eliminar la ruta API. Una prueba de regresión inspecciona la regla para que el bundle productivo conserve OpenAPI. La publicación y smoke de `/api/docs` se registran tras integrar esta corrección.

## 2026-07-13 - Cierre técnico autónomo: ledger SQL, límites verificados y CI honesta

- **Migraciones de producción**: se inspeccionó el changelog reciente de Supabase, se aplicó la migración aditiva `20260713200000_create_sql_migration_ledger.sql` y se hizo bootstrap explícito de 32 SQL reales. `zaltyko_schema_migrations` tiene RLS, deniega acceso a `anon`/`authenticated` y conserva nombre, SHA-256, fecha, actor y modo de ejecución. El runner transaccional con advisory lock termina en `OK: 32 migraciones verificadas; no hay pendientes`.
- **Legado preservado**: el runner usa el nombre completo del archivo como identidad porque el repositorio conserva dos migraciones legítimas `0009_*`; no se renombraron ni alteraron migraciones históricas.
- **Aislamiento y rendimiento**: cada mutación tenant recibe una segunda cuota por academia solo tras resolver ownership/membership en servidor. La primera barrera IP Edge se conserva; no se usa un tenant enviado por el cliente. La auditoría de producción mostró que el índice UNIQUE existente `memberships_user_academy_uq (user_id, academy_id)` ya cubría la consulta objetivo, por lo que no se creó un duplicado.
- **Build/CI**: Sentry usa su API de configuración actual y Swagger se aísla de imports dinámicos en el build. El build local terminó correctamente con 216 rutas. CI smoke/E2E público apunta al dominio canónico `https://zaltyko.com`; E2E autenticado queda condicionado a secretos de repositorio reales, sin imprimirlos ni generar cuentas ficticias.
- **Validación completa previa a integración**: `pnpm verify:production` pasó 279 APIs sin rutas riesgosas, RLS 65/65, 6+32 migraciones, lint, typecheck, 54 archivos/435 pruebas y build de 216 rutas. Playwright público contra producción pasó 6/6. El despliegue se registra al integrar esta rama.

## 2026-07-13 - Fase 4 desplegada y accesible en producción

- **Entrega**: PR #28 integrado en `main` como `b97d7a81`; Vercel publicó `dpl_BU9hYAp6KjwSxVkjREL85X5n2ZPJ` en estado `READY` con los dominios públicos `https://zaltyko.com` y `https://www.zaltyko.com`.
- **Smoke seguro**: la comprobación HTTP no envió formularios ni eventos. `/`, `/pricing` y `/contact?type=network` responden 200 en `zaltyko.com`; `/super-admin/growth` responde 307 a `/auth/login`. El alias interno de Vercel devuelve SSO, sin bloquear los dominios públicos.
- **Datos**: tras el despliegue se verificaron 0 `growth_events`, 0 `leads`, 0 `commercial_interviews` y 0 `academy_trials`; las 2 filas históricas de `subscriptions` no tienen `stripe_subscription_id`. No se introdujeron fixtures.
- **Siguiente gate**: la validación comercial sigue en 0/10 entrevistas y Fase 5 continúa bloqueada hasta completar y sintetizar las 10 entrevistas reales.

## 2026-07-13 - Fase 4 instrumentada: pricing, funnel y evidencia comercial

- **Baseline honesto**: producción tiene 2 academias y 0 leads, 0 eventos growth, 0 trials, 0 suscripciones con `stripe_subscription_id` y 0/10 entrevistas. No se insertaron entrevistas o conversiones ficticias durante QA.
- **Stripe live comprobado**: desde el entorno Vercel de producción se verificaron Prices activos de Starter 19 EUR/mes y Growth 49 EUR/mes, productos activos y metadata correcta. Network conserva contacto/onboarding acompañado y no tiene checkout autoservicio.
- **Fuente first-party**: nueva tabla `growth_events` y endpoint público con allowlist PII-free para pricing/contacto. Trial, checkout, activación/cancelación y conversión se registran desde el servidor con idempotencia y sin romper la acción de negocio si falla la telemetría.
- **Leads recuperables**: contacto y captura de email hacen upsert antes de enviar correo. Las antiguas policies globales de `leads` se reemplazan por acceso directo exclusivo de super-admin.
- **Entrevistas verificables**: `commercial_interviews` deduplica academia/país/ciudad y exige tamaño, herramientas, dolor, objeción, precios y fecha para contar `completed`. APIs CRUD protegidas con `withSuperAdmin`, validación Zod y audit log.
- **Cockpit de Growth**: `/super-admin/growth` muestra funnel, denominadores, progreso 0/10, precio medio solo con evidencia y formulario accesible de programación/edición. Sin histórico, las tasas dicen `sin base`.
- **Pricing/copy**: Starter y Growth muestran “Solicitar demo”; límites de modales de billing consumen el catálogo canónico; Network conserva atribución en contacto. Se retiraron promesas no sustentadas de “RGPD Compliant”, “respuesta 24h”, ahorro o resultados garantizados, conservación ilimitada, puesta en marcha inmediata e integración prioritaria con WhatsApp.
- **Migración**: `20260713170000_phase4_commercial_validation.sql` y Drizzle `0005`, aditivas. Rollback smoke, constraints, FKs, índices y RLS verificados; aplicada a Supabase sin seed global. El push final detectó el constraint histórico `coaches_slug_unique` ausente: se canceló antes de cualquier acción, se comprobaron 3 slugs nulos/0 duplicados y se reconcilió con la migración idempotente `20260713173000_reconcile_coaches_slug_unique.sql`, sin truncar ni modificar filas. Inventario: 6 Drizzle + 31 Supabase, 115 tablas y RLS 65/65.
- **Guard de migraciones remotas**: una segunda inspección de `drizzle-kit push` propuso desactivar RLS, borrar el ledger y cambiar una PK; se eligió `No, abort` y no se ejecutó SQL. `pnpm db:migrate` ahora solo admite PostgreSQL local; staging/producción usan `pnpm db:migrate:reviewed <sql>` hasta implementar un runner con ledger.
- **QA**: 279 APIs sin rutas riesgosas, 431/431 tests, lint/typecheck, `pnpm audit` completo/productivo sin vulnerabilidades y build de 216 páginas. Axe WCAG 2.2 AA pasa sin violaciones en pricing/contacto móvil y Growth autenticado; 375 px sin overflow.
- **Pendiente real**: completar 10 entrevistas distintas y sintetizarlas. Fase 4 no se declara cerrada comercialmente y Fase 5 no comienza.

## 2026-07-10 - Suite unitaria completa y limpieza de formularios

- **Validación global**: `pnpm test` PASS con 45 archivos y 391 pruebas. La ejecución dejó el watcher activo tras el resultado, pero todos los casos terminaron correctamente.
- **FormField**: ya no combina `defaultValue` con un `value` controlado; el valor mostrado se deriva correctamente del prop controlado o del estado no controlado, eliminando un warning de React y un comportamiento ambiguo.
- **Prueba de confirmación**: la resolución de la promesa pendiente se envuelve en `act`, eliminando el warning de actualización asíncrona de React/Radix durante el test.
- **Validación focalizada**: ESLint y `tests/components-critical.test.tsx` PASS 10/10; `git diff --check` limpio. Sin migraciones.

## 2026-07-10 - Historial de correo y cron de avisos corregidos

- **Historial de correo**: destinatarios, asuntos, errores y metadata pasan a estar disponibles solo para owner/admin/super-admin. La API valida `academyId`, paginación y límites en vez de usar `parseInt` sin cotas.
- **Cron programado**: una programación sin destinatarios resueltos se marca `failed`, no `sent`; evita que el producto afirme una entrega que no ocurrió. El fallback que indica “admin users” ahora filtra realmente perfiles owner/admin del tenant.
- **Validación**: ESLint focalizado sin avisos, `git diff --check` limpio y batería focalizada PASS 13/13. No se crearon ni aplicaron migraciones.

## 2026-07-10 - Privacidad de historial y plantillas de comunicación

- **Historial**: se restringe a staff la lectura de registros que incluyen teléfono, cuerpo y metadata; crear registros requiere owner/admin/super-admin. Antes, un `parent` o `athlete` del tenant podía leerlos y crear entradas arbitrarias.
- **Plantillas**: listado, detalle y uso quedan disponibles para staff; crear, editar o borrar requiere owner/admin/super-admin. Se preserva la prohibición existente de borrar plantillas de sistema.
- **Validación**: ESLint focalizado sin avisos, `git diff --check` limpio y `communication-panels`, `link-requests-api`, `product-roles-navigation` PASS 13/13. Sin migraciones nuevas ni aplicadas.

## 2026-07-10 - Endurecimiento de envíos y comunicaciones programadas

- **Contador de avisos**: `/api/notifications/unread-count` consulta ahora por `profile.id`, que es la clave foránea real de `notifications.user_id`; antes usaba el UUID de Auth y podía devolver cero pese a existir avisos sin leer.
- **Push y correo**: `/api/push/send` exige owner/admin/super-admin y comprueba que el perfil destinatario esté en el tenant activo. `/api/notifications/send` exige rol operativo, academia válida del tenant y membership owner/admin (salvo super-admin); además distingue JSON inválido de un payload inválido. No se detectaron consumidores internos del endpoint de correo, por lo que el contrato nuevo con `academyId` obligatorio no rompe llamadas existentes.
- **Programadas y grupos**: padres/atletas ya no pueden consultar o mutar grupos ni programación interna. Crear/cancelar requiere owner/admin/super-admin; lectura queda limitada a staff. La programación valida que grupo y plantilla pertenezcan al tenant antes de guardar sus IDs.
- **Validación**: ESLint focalizado sin avisos, `git diff --check` limpio y las pruebas focalizadas existentes PASS 13/13. No se crearon ni aplicaron migraciones.

## 2026-07-10 - Segunda pasada de seguridad y experiencia de comunicación

- **Conversaciones familiares**: solo `super_admin` puede saltarse la comprobación de tenant. Antes, cualquier `admin` podía crear una conversación de atleta o grupo de otro tenant si conocía el ID.
- **P2P**: la reutilización de conversaciones exige ahora que emisor y destinatario sean exactamente los dos participantes y respeta la academia solicitada. Evita devolver por error una conversación P2P ajena que contenga solo al destinatario.
- **Anuncios**: los miembros normales ya no pueden consultar borradores o archivados mediante `status`; la API valida estado, categoría y paginación. Las notificaciones de anuncio usan el `tenantId` resuelto por `withTenant` y el enlace moderno `/app/[academyId]/announcements/[id]`.
- **Centro de notificaciones**: corregido el consumo del envelope `{ ok, data: { items } }`, que mantenía el modal emergente vacío aunque hubiera datos. Los deep links abren ahora consulta de directorio, conversación interna y anuncio en su destino correcto; solo se aceptan URLs internas `/app/` desde metadata.
- **Validación**: ESLint focalizado sin avisos, `git diff --check` limpio y `communication-panels`, `link-requests-api`, `product-roles-navigation` PASS 13/13. Playwright con owner renovado: `/messages`, `/comms` (incluida pestaña de notificaciones) y `/notifications` cargan 200 y muestran sus estados reales.
- **Límite E2E**: el guardado automatizado de sesión actualizó owner, pero el runner se bloqueó antes de completar coach/super-admin; no se consideran renovadas esas sesiones ni verificado un recorrido nuevo multirol. El servidor `next dev` se reinició tras el manifiesto HMR corrupto conocido; no hay migraciones creadas ni aplicadas.

## 2026-07-10 - Endurecimiento adicional de conversaciones internas

- **Aislamiento de tenant**: las operaciones de leer, actualizar, ocultar y enviar mensajes confirman ahora que la conversación pertenece al `tenantId` activo, además de exigir participación. La actualización del último mensaje mantiene el mismo filtro.
- **Integridad y validación**: límites de paginación acotados a 1–100, cursor inválido rechazado con 400 y una respuesta solo puede referenciar un mensaje de la misma conversación. `PATCH` devuelve 400 ante JSON inválido y conserva título compartido y preferencias privadas en sus tablas respectivas.
- **Validación ejecutada**: ESLint focalizado sin avisos; `link-requests-api`, `product-roles-navigation` y `communication-panels` PASS 13/13. `pnpm typecheck` sigue bloqueado exclusivamente en `vitest.config.ts` por dos versiones incompatibles de Vite (5.4.21 y 6.4.3), cambio ajeno a este módulo; no se modificaron dependencias.
- **Migraciones**: ninguna creada ni aplicada.

## 2026-07-10 - Correccion de solicitudes de vinculo para portal familiar

- **Causa raiz**: un `parent` o `athlete` sin academy/tenant activo recibia `TENANT_MISSING` al consultar `/api/link-requests?scope=incoming`; por ello no podia ver ni aceptar la solicitud que le daba acceso. Ademas, `scope=outgoing` no estaba implementado y devolvia erroneamente solicitudes entrantes.
- **Correccion**: `/api/link-requests` ahora permite el estado pre-vinculo de forma acotada y valida los scopes `incoming`, `outgoing` y `academy`; `outgoing` filtra por `requestedByProfileId`. Al aceptar, el perfil sincroniza `activeAcademyId` y `tenantId` desde la solicitud, requisito de las guardas del portal limitado.
- **Seguridad**: no se amplio el acceso a datos de academia: la lectura entrante queda filtrada por `targetProfileId`, la respuesta sigue validando ese mismo perfil, y las operaciones de academia siguen comprobando membership/tenant.
- **Validacion**: `tests/link-requests-api.test.ts` PASS 2/2; ESLint focalizado PASS. E2E manual: parent creado, solicitud saliente localizada y la API incoming ya devuelve la solicitud pendiente; queda reejecutar la aceptacion con una solicitud nueva para observar el redirect posterior a esta correccion.
- **Deep link legacy reparado**: `/dashboard/messages/[conversationId]` verificaba participación pero renderizaba la bandeja sin seleccionar la conversación. Ahora redirige a `/dashboard/messages?c=...`, el contrato que el componente de mensajes usa para abrirla.
- **Chequeo adicional**: `link-requests-api` + `product-roles-navigation` PASS 10/10; ESLint focalizado PASS.
- **Mutación de conversaciones corregida**: `PATCH /api/messages/conversations/[id]` mezclaba preferencias privadas de participante con campos de la conversación. Ahora valida payload estricto, actualiza solo el título compartido cuando el participante es owner/admin y persiste silenciamiento/notificaciones únicamente en `conversation_participants` del usuario actual; el título queda acotado al tenant activo.
- **Regresión cubierta**: el test de aceptación de vínculo ahora exige que el perfil destino reciba tanto `activeAcademyId` como `tenantId` de la solicitud. `link-requests-api` PASS 2/2 tras añadir la aserción.
- **Cierre técnico de ronda**: `git diff --check` limpio; batería focalizada `link-requests-api`, `product-roles-navigation` y `communication-panels` PASS 13/13.

## 2026-07-10 - Verificacion E2E parcial de comunicacion por roles

- **Owner y coach**: sesiones E2E regeneradas con cuentas de prueba; Playwright CLI confirma que ambos cargan `/app/[academyId]/messages` autenticados y con la bandeja interna. El owner ve el acceso separado a `contact-messages`; el coach no lo recibe en la interfaz.
- **Centro unificado**: owner validado visualmente en `/comms`; sus tabs Mensajes, Anuncios y Notificaciones cargan sus estados vacios reales sin usar el formato legacy de API ni mostrar errores de aplicacion.
- **Limitacion de cobertura**: no hay cuentas/sesiones E2E `parent` ni `athlete`, ni una segunda academia de prueba para ejercer aislamiento cross-academy. Por ello no se pudo verificar en navegador el flujo bidireccional staff↔familia, lectura de notificacion ni rechazo cross-tenant. La guarda de rutas limitada y las pruebas unitarias permanecen cubiertas, pero el QA humano/fixture de esos roles sigue pendiente.
- **Entorno**: el primer intento en `next dev` encontro un manifiesto HMR corrupto de Next (`__webpack_modules__[moduleId] is not a function`), no un fallo funcional reproducible; tras reiniciar servidor y regenerar sesiones las rutas de owner/coach cargaron correctamente.

## 2026-07-10 - Mensajeria interna y notificaciones conectadas y endurecidas

- **Ruta canonica corregida**: `/app/[academyId]/messages` deja de mostrar consultas del directorio y conecta la bandeja de conversaciones internas para cualquier miembro de la academia, incluidos `parent` y `athlete`. Las consultas publicas se conservan en `/app/[academyId]/contact-messages`, limitada a owner/admin/super-admin.
- **Centro unificado reparado**: Mensajes, Anuncios y Notificaciones consumian el envelope legacy `success/data`; ahora usan el contrato real `{ ok, data: { items } }`, muestran errores reales y respetan los nombres camelCase de la API.
- **Notificaciones reparadas**: la API deja de convertir query params ausentes (`null`) en errores Zod/500; paginacion sin duplicar la primera pagina; deep links distinguen consulta publica de conversacion interna. Marcar como leida y eliminar exige `tenantId + userId`, cerrando mutacion horizontal por ID dentro del mismo tenant.
- **Mensajeria endurecida**: creacion/listado filtra por academia; emisor y destinatarios deben pertenecer al mismo tenant y academia; envio usa Zod y valida que la conversacion pertenezca al tenant activo. El shortcut P2P evita duplicados por metadata JSON parcial y genera deep link a la conversacion.
- **Pruebas**: `communication-panels` + `product-roles-navigation` PASS 11/11; `pnpm typecheck` PASS; ESLint focalizado PASS; `pnpm check:migrations` PASS. Suite completa: 387/391 PASS; cuatro fallos preexistentes y ajenos al modulo en `audit-hardening` (timeout/membership mock) y `api-sport-migration` (timeout/mock `logger.apiError`). `pnpm validate:rls` confirma 100% de cobertura, pero EXIT 1 por policies duplicadas de `audit_logs` en las migraciones sin commit `20260709000000/20260709010000` de otra sesion; no relacionado con comunicacion y no se modifico.
- **Migraciones**: ninguna nueva ni modificada; las tablas de comunicacion ya estaban materializadas por `20260703000001_create_missing_messaging_tables.sql` y migraciones previas. Pendiente humano: QA real con parent/coach; pendiente de producto: disparador de aviso desde clase/sesion.

## 2026-07-09 - Correcciones P1 Super Admin tras auditoria

- **Perfil operativo corregido**: el boton "Ver como usuario" pasa a "Abrir perfil operativo" y usa `/dashboard/view/[profileId]`; la vista de perfil obtiene el email Auth del usuario objetivo para no mezclarlo con el email del Super Admin conectado. En coach/athlete se corrigio tambien el filtro para cargar el registro ligado al usuario objetivo, no el primer registro de la academia.
- **Acciones sensibles endurecidas**: la tabla de usuarios ya no cambia roles al instante; cualquier cambio de rol abre confirmacion con rol origen/destino. Los labels de rol visibles pasan a espanol (`Dueño`, `Entrenador`, `Super admin`). Los campos de contrasena temporal en crear usuario/academia quedan ocultos por defecto con mostrar/ocultar.
- **Lifecycle de academia decidido**: borrar una academia desde Super Admin conserva la cuenta personal del dueño. El dialogo de borrado lo comunica y el audit metadata marca `ownerAccountRetained: true`.
- **Audit logs preparados**: `logAdminAction` ahora acepta `resourceType`, `resourceId`, `resourceName`, `description`, `status` y metadata mas legible. Se agrego la migracion `20260709000000_allow_global_audit_logs.sql` para permitir logs globales con `tenant_id IS NULL`; no se ejecuto `drizzle-kit push`.
- **Validacion**: `pnpm typecheck` PASS; ESLint focalizado PASS con warnings existentes; `tests/audit-hardening.test.ts` PASS 12/12; `tests/e2e-role-smoke.spec.ts --project=chromium --workers=1` PASS 10/10; Playwright autenticado verifico contrasenas ocultas, confirmacion de rol y perfil operativo con email objetivo. Riesgo nuevo: `/api/profile/preferences` devuelve 500 en QA y queda en backlog.

## 2026-07-09 - E2E autenticado estabilizado + roles Coach/Super Admin verificados

- **Full academy E2E estabilizado**: `tests/e2e-zaltyko-full.spec.ts` separa el smoke de rutas criticas por pagina, usa modo serial y evita el loop unico que agotaba el timeout de Next dev. Tambien endurece navegacion ante `ERR_CONNECTION_RESET`/`ERR_NETWORK_IO_SUSPENDED`, valida `#main-content` por ruta, navega al detalle de atleta por `href` y sube timeout en billing/settings/PWA.
- **A11y E2E estabilizado**: `tests/a11y-zaltyko.spec.ts` usa `domcontentloaded`, esperas acotadas y retry de axe solo cuando se destruye el contexto por navegacion durante compilacion. No oculta violaciones WCAG: la asercion sigue siendo `results.violations === []`.
- **Role smoke sin flakes**: `tests/e2e-role-smoke.spec.ts` separa superficies Super Admin y Owner por ruta y mantiene Coach con validacion de no acceso a cobros/ajustes admin. Resultado final: PASS 10/10 con `E2E_OWNER_STORAGE_STATE=.auth/user.json`, `E2E_COACH_STORAGE_STATE=.auth/coach.json` y `E2E_SUPER_ADMIN_STORAGE_STATE=.auth/super-admin.json`.
- **Validacion final**: `pnpm exec eslint tests/e2e-role-smoke.spec.ts tests/a11y-zaltyko.spec.ts tests/e2e-zaltyko-full.spec.ts --quiet` PASS; `pnpm exec tsc --noEmit` PASS; `playwright test tests/e2e-zaltyko-full.spec.ts tests/e2e-zaltyko-public.spec.ts tests/a11y-zaltyko.spec.ts --project=chromium --workers=1` PASS 30/30; `playwright test tests/e2e-role-smoke.spec.ts --project=chromium --workers=1` PASS 10/10.
- **Nota de entorno**: `pnpm audit:sprint3 -- --project=chromium --workers=1` no es fiable porque pnpm pasa un `--` literal y Playwright corre con workers/proyectos no esperados. Para auditoria local usar `pnpm exec playwright test ... --project=chromium --workers=1` directo. En corridas muy largas Next dev puede reiniciarse por memoria; reiniciar el servidor antes de role smoke deja la validacion limpia.

## 2026-07-09 - Auditoria Super Admin profunda con sesion real de prueba

- **Super Admin operativo base**: dashboard, usuarios, academias, academias publicas y logs cargan sin errores. APIs `/api/super-admin/metrics`, `/users`, `/academies` y `/logs` responden 200. Owner y Coach no ven `/super-admin/*`; son redirigidos a `/app`.
- **CRUD temporal validado y limpiado**: crear usuario temporal, validar password corto, borrar usuario, crear academia temporal con dueño, abrir detalle API y borrar academia pasan. Hallazgo: borrar la academia no borra/desvincula automaticamente el owner creado en el flujo "Crear academia + dueño"; se limpio manualmente el usuario temporal residual.
- **Hallazgos UX/copy/seguridad**: "Ver como usuario" muestra perfil objetivo pero conserva correo del Super Admin; roles y estados mezclan ingles/tecnico (`Owner`, `Coach`, `Active`); contraseñas temporales se muestran en campos de texto; tablas mobile funcionan pero son densas; logs muestran JSON crudo. Ademas, `logAdminAction` fallo al insertar acciones sensibles (`user.created`, `user.deleted` y similares) aunque la operacion principal si completo.
- **Rutas ocultas**: `/super-admin/billing` y `/super-admin/settings` siguen como placeholders y deben permanecer fuera del menu. `/super-admin/support` redirige a `/dashboard`, comportamiento confuso si alguien accede directo.
- **Evidencia**: `output/super-admin-audit/RESUMEN.md`, `report.json` y capturas en `output/super-admin-audit/`.

## 2026-07-08 - Storage states E2E por rol + auditoria autenticada

- **Storage states por rol regenerados**: `pnpm test:e2e:auth` ahora prepara usuarios E2E con Supabase service role y genera sesiones para owner, coach y super-admin en `.auth/user.json`, `.auth/coach.json` y `.auth/super-admin.json`.
- **Variables E2E documentadas**: `.env.example`, README y docs QA incluyen `E2E_OWNER_STORAGE_STATE`, `E2E_COACH_STORAGE_STATE` y `E2E_SUPER_ADMIN_STORAGE_STATE`, ademas de emails/passwords por rol.
- **Smoke por roles**: `tests/e2e-role-smoke.spec.ts --project=chromium` PASS 3/3. Super-admin accede a superficies core, owner abre modulos criticos y coach abre dashboard/classes/assessments sin contenido admin de cobros/ajustes.
- **Guardas reforzadas**: `billing/page.tsx` bloquea contenido de cobros para perfiles/memberships no admin/owner; `settings/page.tsx` redirige/null-render para no admin. La evidencia HTTP con coach devuelve shell/dashboard, no contenido de cobros.
- **E2E principal**: `tests/e2e-zaltyko-full.spec.ts --project=chromium --workers=1` PASS con 9 passed y 1 flaky que pasa en retry (`critical academy pages render without route-level errors`, navegacion interrumpida por redirect dashboard durante `/athletes`).
- **Public smoke**: `tests/e2e-zaltyko-public.spec.ts --project=chromium --workers=1` PASS 6/6 tras actualizar copy esperado de "Facturacion" a "Cobros" y navegar con `domcontentloaded`.
- **A11y pendiente**: `tests/a11y-zaltyko.spec.ts --project=chromium --workers=1` FAIL autenticado. Public landing PASS; login fue flaky y paso en retry; dashboard y athletes fallan por axe con `aria-progressbar-name`, contrastes insuficientes y selects sin nombre accesible. Queda como deuda de accesibilidad, no como bloqueo de storage states.
- **Limitacion de entorno**: Firefox/WebKit no estan instalados localmente; las corridas validas se ejecutaron en Chromium. Un intento via `pnpm test:e2e -- --project=chromium` se corto porque pnpm paso `--` como argumento y Playwright intento tambien Firefox/WebKit.

## 2026-07-08 - Fix scroll publico + Growth pricing v3.0

- **Scroll global corregido**: `src/app/globals.css` cambia `html, body { height: 100%; }` por `min-height: 100%`. El bug fijaba el `documentElement` a la altura del viewport y dejaba el contenido largo en `body`, impidiendo scroll real en las paginas publicas.
- **Growth alineado con pricing v3.0**: `src/lib/plans/catalog.ts` deja Growth (`code: pro`) en `academyLimit: 1`, cambia el resumen a "Hasta 200 gimnastas · 1 academia" y elimina "Academias ilimitadas" de sus features.
- **Network reformulado como multi-sede acompanado**: el catalogo y el error de limite de academias reemplazan la promesa de academias ilimitadas autoservicio por "Multi-sede con onboarding acompanado", coherente con [[Pricing]] y [[Mensajes aprobados]].
- **Guardrails actualizados**: `tests/product-go-live-readiness.test.ts` ahora falla si Starter o Growth vuelven a prometer academias ilimitadas. `tests/limits.test.ts` tambien se actualizo, aunque sigue excluido por `vitest.config.ts`.
- **Validacion**: `pnpm exec vitest run tests/product-go-live-readiness.test.ts` PASS, `pnpm typecheck` PASS. QA manual con Playwright en `http://127.0.0.1:3000`: `/`, `/pricing`, `/features` y `/marketplace` hacen scroll en desktop y mobile; `/pricing` muestra Growth con "1 academia" y ningun plan contiene "Academias ilimitadas".
- **E2E autenticado recuperado**: el usuario Auth E2E no existia. Se creo con service role, email confirmado y password local de `E2E_AUTH_PASSWORD`; se creo perfil owner/membership para `Aurora Elite Demo`, se corrigio `E2E_ACADEMY_ID` local al ID real de esa academia y se regenero `.auth/user.json`. Validacion: `pnpm test:e2e:verify-supabase` PASS, `pnpm test:e2e:auth` PASS (chromium/firefox/webkit) y `tests/e2e-role-smoke.spec.ts --project=chromium` PASS para owner. Coach y super-admin quedan saltados hasta configurar `E2E_COACH_STORAGE_STATE` y `E2E_SUPER_ADMIN_STORAGE_STATE`.

## 2026-07-08 - QA en vivo (login real, super-admin, panel academia) + 7 bugs corregidos

**Sesion de QA en vivo con credenciales reales** (`mentessaas@gmail.com`, cuenta super_admin dueña de "MentesSaas Academy" en produccion). Se recorrio login, super-admin (dashboard/usuarios/academias/academias publicas/logs) y el panel completo de academia (dashboard, gimnastas, entrenadores, grupos, eventos, evaluaciones, mensajes, anuncios, cobros, ajustes) en desktop y mobile.

**Bugs P1 (rompian siempre, no intermitentes) encontrados y corregidos**:

- **`/api/dashboard/kpi-trends` devolvia 500 siempre**: `extractAcademyId()` en `src/lib/authz/endpoint-config.ts` tiene un regex `^\/api\/dashboard\/([^/]+)` pensado para rutas dinamicas `/api/dashboard/[academyId]/...`, pero tambien matcheaba la ruta estatica `/api/dashboard/kpi-trends` (que pasa `academyId` por query string) y devolvia el string literal `"kpi-trends"` como si fuera el academyId, rompiendo la query SQL (`academies.id = 'kpi-trends'`). Fix: revisar el query param `academyId` **antes** que el regex de pathname. Rompia el sparkline de tendencias del dashboard de academia.
- **`/api/contact-messages` devolvia 500 siempre**: mismo patron ya documentado en este changelog (ver settings, 2026-07-07) — `URLSearchParams.get()` devuelve `null` (no `undefined`) cuando falta un query param, y el schema Zod usaba `.optional()` (solo cubre `undefined`) en vez de `.nullable().optional()`. Rompia la carga de "Mensajes" en el panel de academia.
- **`/super-admin/users/[profileId]` (detalle de usuario) rompia siempre con "Error del Sistema"**: la Server Component hace un `fetch()` interno a su propia API (`/api/super-admin/users/[profileId]`, protegida con `withSuperAdmin`) pero no reenviaba las cookies de sesion (`headers: {}` vacio) — un `fetch()` server-side en Next.js **no hereda cookies automaticamente** aunque sea al mismo origen. La API respondia 401/403, `response.ok` era falso, y la pagina lanzaba `throw new Error("Failed to fetch user details")`. Fix: `headers: { cookie: cookieStore.getAll().map(c => \`${c.name}=${c.value}\`).join("; ") } }`. Comparar con el patron correcto ya usado en `academies/[academyId]/page.tsx`, que evita el self-fetch por completo llamando directo a una funcion de datos (`getSuperAdminAcademyDetail`) — mas robusto a largo plazo si se vuelve a tocar esta pagina.
- **Mismo detalle de usuario, segundo bug en cascada tras arreglar el primero**: `TypeError: Cannot read properties of undefined (reading 'length')` en `user.memberships.length`. Causa: la API envuelve la respuesta en `{ok, data}` (convencion `apiSuccess()`, ver nota en Security de este mismo repo) pero `page.tsx` hacia `const userData = await response.json()` sin desestructurar `{ data }`, pasando el objeto `{ok, data}` completo como si fuera el usuario. Mismo patron **repetido 4 veces mas** dentro de `SuperAdminUserDetail.tsx` (refresh tras activar acceso, guardar cambios, y dos acciones mas) — las 5 instancias corregidas con `const { data: refreshed } = await refreshResponse.json()`.
- **Busqueda/filtro roto en 3 tablas de super-admin** (usuarios, academias, logs): mismo patron de `{data}` sin desestructurar en `SuperAdminUsersTable.tsx`, `SuperAdminAcademiesTable.tsx` y `SuperAdminLogsTable.tsx` — el listado inicial (server-rendered) se veia bien, pero cualquier refetch client-side (filtro, busqueda, boton "Actualizar") devolvia lista vacia silenciosamente (`payload.items` era `undefined`, `?? []` lo enmascaraba sin error visible). Corregidas las 3.

Este patron (`{ok, data}` sin desestructurar) ya se habia documentado y corregido antes para el detalle de academia (2026-07-07) y para `useDashboardData` — son **7 recurrencias mas** del mismo error en el panel de usuarios. Vale la pena, en otra sesion, revisar si conviene un helper compartido tipo `apiFetch<T>()` que desestructure `{data}` automaticamente para evitar que siga repitiendose.

**P3 (cosmeticos, corregidos)**:

- `src/components/login-form/LoginForm.tsx` era codigo muerto (nunca se importaba, no habia `index.ts` en esa carpeta; el login real usa `src/components/login-form.tsx`) — eliminado.
- Textos sin traducir: "Active" → "Activo" en `PlanUsage.tsx` (dashboard, viene de `plan.status` de Stripe sin mapear); "/ month" → "/ mes" en `BillingPanel.tsx` (viene de `price.recurring.interval` de Stripe sin mapear, dos usos). Ambos con un mapa de traduccion local, no una libreria i18n nueva.

**Pendiente sin tocar (autorizacion insuficiente / guardado por diseño)**:

- Nombre de perfil "MenetesSaas" → "MentesSaaS": es un typo real en el dato, pero el propio formulario de edicion de usuario **bloquea intencionalmente** editar perfiles con `role === "super_admin"` (`disabled={... || user.role === "super_admin"}` en `SuperAdminUserDetail.tsx`). No se forzo saltandose esa guarda vía API directa.

**Hallazgo descartado (falso positivo)**:

- ~~Filas de la tabla `/super-admin/academies` sin accion al click~~ — si navegan bien a `/super-admin/academies/[id]` via `router.push`; el test inicial verifico la URL antes de que la navegacion async terminara (mismo timing gotcha que el submit de login mas abajo).

**Validacion**: `pnpm typecheck` PASS, `pnpm lint` PASS, `pnpm build` PASS, `pnpm exec vitest run` 388/388 PASS. Los 3 bugs de fetch (`kpi-trends`, `contact-messages`, `users/[profileId]`) y el de `.data` en cascada se verificaron en el navegador real, no solo por tipos — antes/despues en cada uno.

**Nota de entorno**: en `next dev` (no en build de produccion) navegar rapido entre rutas puede mostrar el CSS sin cargar (`document.styleSheets.length === 0`) por como Next 15 versiona el CSS por timestamp en cada request en modo dev. Verificado que **no reproduce en produccion** (`next build && next start`, CSS con hash de contenido, 200 OK). Es ruido de tooling, no bug de producto.

## 2026-07-07 - Refactor tecnico inicial + tooling pnpm/auditor API

- **Hardening demo/refactor senior**: creados `docs/REFACTOR_AUDIT.md`, `docs/FUNCTIONAL_AUDIT.md`, `docs/REFACTOR_PLAN.md`, `docs/QA_CHECKLIST.md`, `docs/DEMO_READY_CHECKLIST.md` y `docs/REFACTOR_REPORT.md` con auditoria por stack, roles, riesgos, plan y validacion.
- **Super admin sin metricas inventadas**: retirados fallback de meses 2025, tendencias fijas, revenue estimado con multiplicador y comparativa basada en planes/promedios. Cuando falta fuente real, la UI queda en estado vacio.
- **Posicionamiento no fiscal**: copy visible de cobros/billing/settings ajustado a cobros, cuotas, recibos internos y suscripcion. No se agrego VeriFactu, AEAT, firma fiscal ni logica de facturacion oficial.
- **QA autenticado pendiente**: Playwright ya no falla por worktrees, pero `.auth/user.json` actual redirige a `/auth/login`; regenerar storage state antes de demo comercial.
- **Validacion del bloque demo/refactor**: `pnpm typecheck` PASS, `pnpm lint` PASS, `pnpm exec vitest run` PASS (37 archivos, 354 tests), `pnpm build` PASS.

- **Tooling pnpm modernizado**: `pnpm.overrides` sale de `package.json` y pasa a `pnpm-workspace.yaml`, compatible con pnpm 11. Se declara `allowBuilds`/`onlyBuiltDependencies` para builds nativos aprobados y se agrega `confirmModulesPurge=false` en `.npmrc` para instalaciones no interactivas.
- **Lockfile reproducible**: la entrada del tarball oficial `xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` ahora incluye `integrity` sha512. `CI=true pnpm install --frozen-lockfile` vuelve a pasar.
- **Auditor API actualizado**: `scripts/audit-api-routes.ts` deja de buscar `proxy.ts` y detecta rate limit global desde `middleware.ts`. Tambien reconoce auth bearer por helpers actuales. Resultado: 265 rutas, 174 mutantes, 0 riesgos sin clasificar.
- **Refactor EventForm**: extraida logica pura a `src/components/events/event-form-model.ts` (schema Zod, defaults, initialData legacy y payload API) y UI a `src/components/events/EventFormSections.tsx`. `EventForm.tsx` queda como coordinador de react-hook-form/envio (227 lineas).
- **Refactor clases**: extraidas reglas puras de actualizacion a `src/lib/classes/update-class-helpers.ts` (grupos candidatos, sportConfig efectivo, aparatos, weekdays y horario final). La ruta `src/app/api/classes/[classId]/route.ts` conserva comportamiento y delega esas decisiones.
- **Refactor DashboardPage**: extraido fetch de checklist a `src/components/dashboard/useDashboardChecklist.ts` y secciones visuales a `src/components/dashboard/DashboardSections.tsx` (hero, distribucion deportiva, starter setup, navegacion rapida, onboarding y actividad reciente). `DashboardPage.tsx` baja a 631 lineas.
- **Refactor settings**: extraido modelo de configuracion de academia a `src/components/settings/academy-settings-model.ts` (tipos, defaults, normalizacion del payload API y editores deportivos activos). `settings/page.tsx` baja a 742 lineas.
- **Refactor AthletesTableView**: extraidas secciones visuales a `src/components/athletes/AthletesTableSections.tsx` (toolbar, empty state, tabla y paginacion). `AthletesTableView.tsx` queda como coordinador de estado, filtros, export CSV y dialogos (444 lineas).
- **Refactor EditClassDialog**: extraidos tipos/helpers a `src/components/classes/edit-class-dialog-model.ts` y secciones visuales a `src/components/classes/EditClassDialogSections.tsx`. `EditClassDialog.tsx` queda centrado en estado, compatibilidad por rama, submit y delete (426 lineas).
- **Tests nuevos**: `tests/event-form-model.test.ts` y `tests/lib/update-class-helpers.test.ts` cubren la logica extraida.
- **Validacion**: `tsc --noEmit` OK, `eslint ... --quiet` OK, `vitest run --passWithNoTests` 354/354 PASS, `audit-api-routes --strict` PASS, `next build` OK (201 paginas estaticas generadas).

## 2026-07-07 - Sesion super-admin CRUD + fixes de settings/env (5 PRs mergeados a main)

> Trabajo en paralelo al "Refactor tecnico inicial" de mas arriba (misma fecha, working tree compartido). Esta sesion trabajo sobre `main` con PRs propios: #15 (QA batch), #16 (CRUD), #17/#18 (campos de edicion academia + fix de refresh), #19 (fix 400 settings + env client-side). No toca los ~100 archivos del refactor senior (siguen sin commitear en el working tree al cierre de esta sesion).

**Auditoria de roles externa (Codex) verificada y remediada (PR #15, commit `8b60420`)**:

- Verificadas contra prod las cifras de una auditoria externa sobre permisos/roles: 41 `auth.users`, 45 `profiles`, 36 con rol global `owner`, 11 con `@zaltyko.local`, 3 con tenant mismatch — todas exactas.
- Causa raiz real: `src/lib/authz/permissions-service.ts` otorgaba `getAllPermissions()` a **cualquier** perfil con rol global `owner` (default de signup de todos) sobre **cualquier** academia, sin verificar `ownerId`. Escalada de permisos cross-tenant real, no teorica.
- El script de remediacion propuesto por la auditoria externa tenia un bug critico: incluia `DROP TRIGGER on_auth_user_created`, lo que habria roto el signup real (el registro depende 100% de ese trigger para crear el perfil; `register-form.tsx` no lo hace en codigo). Se descarto ese paso.
- Fix aplicado: `permissions-service.ts` ahora verifica `academies.ownerId === profile.id` o una membership `owner` explicita antes de otorgar permisos completos. Ver [[Registro de riesgos]].
- Purga de datos de test en produccion (transaccional, confirmada con el usuario via pregunta explicita por ser irreversible): 7 academias + 43 perfiles + 39 cuentas Auth de test eliminadas. Quedan solo 2 cuentas reales (super_admin + owner) y la academia real, sin huerfanos. Script `scripts/purge-test-data.ts` usado una vez y eliminado del repo (peligroso si se re-ejecuta).
- Fixes QA adicionales en el mismo lote: crash de `GymMetricsWidget` (props sin default en `reduce`), crash de detalle de academia super-admin (self-fetch sin cookies -> 401 -> throw, reemplazado por consulta directa a DB via `getSuperAdminAcademyDetail`), metricas de engagement fabricadas puestas a 0 con nota explicativa, hydration error #418 (quitar `Math.random()` de `revenueChartData`), validacion de fecha de nacimiento en `CreateAthleteDialog`, redirect de `/app/[academyId]` (antes 404), `/app` resolviendo la academia real via fetch en vez de depender de `useDevSession` (deshabilitada en prod), `verifyAcademyAccess` con bypass para `super_admin`, ocultados enlaces rotos/placeholder (Facturacion/Soporte/Configuracion) del sidebar y top-nav de super-admin, confirmacion antes de promover a `super_admin`.

**CRUD completo de super-admin (PR #16, commit `fda96e1`)**:

- A peticion explicita del usuario ("el super admin deberia poder crear/editar/modificar academias y usuarios... todo desde el panel"), alcance elegido: **todo**.
- Nuevo: crear academia + cuenta de dueño en un paso (`SuperAdminCreateAcademyDialog.tsx` -> `POST /api/super-admin/academies`), crear usuario con cualquier rol (`SuperAdminCreateUserDialog.tsx` -> `POST /api/super-admin/users`), eliminar usuario (`DELETE /api/super-admin/users/[profileId]`).
- Nuevas funciones en `src/lib/supabase/admin-operations.ts`: `createAuthUser`/`deleteAuthUser` (via `supabase.auth.admin`).
- Guardas: no auto-eliminacion, no eliminar el ultimo `super_admin`, confirmacion antes de borrar.

**Fix: campos de edicion de academia incompletos + bug de refresh tras guardar (PR #17/#18, commits `5163782`/`3906285`)**:

- El PATCH de edicion de academia ya aceptaba `academyType`/`country`/`region`/`city` pero el formulario del detalle solo exponia nombre y plan. Se agregaron los campos faltantes al formulario.
- Al verificar el fix en produccion contra la academia real (MentesSaas Academy), el guardado mostro "Sin nombre"/"Sin plan" tras guardar. **Investigado antes de asumir corrupcion**: se verifico directo contra la DB de prod (solo lectura) y los datos estaban intactos — era un bug de UI preexistente: `apiSuccess()` envuelve las respuestas en `{ok, data}` pero el componente usaba la respuesta cruda sin desempaquetar `.data`. Afectaba tambien al boton Suspender/Reactivar. Corregido en ambos flujos. El dato de prueba usado durante la verificacion se revirtio en DB tras confirmar el fix.

**Fix: 400 en Ajustes de la academia + validacion de env corriendo en el navegador (PR #19, commit `8c59c3d`)**:

- Reportado por el usuario: `PATCH /api/academies/[academyId]/settings` devolvia 400 en cada guardado desde `/app/[academyId]/settings`.
- Reproducido en vivo interceptando `window.fetch` en la consola del navegador: el formulario cliente envia `null` (no `undefined`) en `publicDescription` y en todos los campos de `contact` (website, email, telefono, direccion, redes) cuando estan vacios. El schema Zod del servidor solo declaraba `.optional()`, que NO acepta `null`. Se agrego `.nullable()` a esos campos; el codigo que mapea a la actualizacion ya trataba `null` correctamente (`data.x || null`), solo faltaba pasar la validacion.
- Bonus detectado en el mismo debug: el usuario reporto en consola `[env] Variables criticas no configuradas en produccion: STRIPE_SECRET_KEY, DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY` — pero corriendo en el **navegador**, no en el servidor. Causa: `src/lib/logger.ts` importa `isProduction()` de `src/lib/env.ts`, y `logger.ts` se usa desde `src/app/error.tsx` (`"use client"`), asi que `env.ts` completo (incluida la validacion Zod server-only) se bundlea y ejecuta tambien en el cliente. No hay fuga real de secretos (Next.js no inyecta esas variables al bundle del cliente), pero es codigo de servidor corriendo donde no deberia y logueaba un falso positivo. Fix: `serverEnv` ahora solo corre `validateServerEnv()` cuando `typeof window === "undefined"`; en cliente usa un stub con solo `NODE_ENV` (que si es seguro, Next.js lo inlinea).
- **Patron a vigilar**: cualquier modulo server-only importado transitivamente por un componente cliente (via `error.tsx`, `global-error.tsx`, o cualquier archivo `"use client"`) puede terminar en el bundle del navegador. Guardar logica que dependa de variables server-only con `typeof window === "undefined"`.

**Validacion**: `pnpm typecheck` limpio en cada PR. Deploy Vercel verificado Ready para cada uno; fix de settings verificado localmente contra el payload real capturado del navegador (`SettingsSchema.safeParse` pasa).

## 2026-06-26 - Upgrades de dependencias (VALIDADO Y COMMITEADO)

> **Estado: validado y commiteado** en `security/audit-remediation`. Validacion: `pnpm typecheck` limpio, `pnpm exec vitest run` 346/346 PASS, `pnpm build` exitoso. El riesgo de `jspdf` 2→4 quedo acotado: el codigo ya usaba la API funcional `autoTable(doc, {...})` (compatible con v4) en `AssessmentPDFExport`, `receipt-generator` y `reports/pdf-generator`. `xlsx` por tarball oficial sin romper export.

**Bumps de seguridad (pnpm overrides añadidos)**: `ws ^8.21.0`, `path-to-regexp ^8.4.0`, `protobufjs ^7.5.6`, `lodash ^4.18.1`, `immutable ^3.8.3`, `form-data ^4.0.6`. Cierran advisories transitivos.

**Bumps de versiones directas**:

- `next` 15.5.15 → 15.5.19 (+ `eslint-config-next`/`@next/eslint-plugin-next` alineados a 15.5.19).
- `@modelcontextprotocol/sdk` 1.22 → 1.29 y `mcp-handler` 1.0.4 → 1.1.0 (capacidades MCP de agentes).
- `drizzle-orm` 0.44.7 → 0.45.2.
- `jspdf` 2.5.2 → 4.2.1 (+ `jspdf-autotable` 5.0.7 → 5.0.8) — **cambio mayor**, revisar reportes/export PDF (attendance, financial).
- `xlsx` 0.18.5 → tarball oficial `cdn.sheetjs.com/xlsx-0.20.3` (la distribucion npm dejo de actualizarse; el oficial trae fixes de seguridad).
- `axios` 1.15 → 1.18.1, `form-data` 1.0.1 → 1.0.6.

**Riesgo**: `jspdf` 2→4 y `xlsx` por URL pueden romper export de reportes; correr `pnpm test` + smoke de export antes de mergear. Registrado en [[Backlog priorizado]] (P1) y [[Registro de riesgos]].

## 2026-06-26 - Fix CI + root routing 404 (commit `406c498`)

Cierre de 4 fallos de CI y del 404 en la raiz del sitio, sobre `security/audit-remediation`:

- **`pnpm check:migrations` FAIL → drizzle versionado**: el directorio `drizzle/` estaba en `.gitignore`. Se commitea (3 migraciones + meta journal) para que la verificacion de integridad pase en CI.
- **`pnpm validate:rls` FAIL → RLS sport_configs**: nueva migracion `drizzle/20260626000000_rls_sport_configs.sql` habilita RLS en `academy_sport_configs`, `athlete_sport_configs` y `coach_sport_configs` (3 tablas que faltaban). Cobertura **100% sobre 62 tablas tenant-scoped**.
- **Smoke tests FAIL → PATH**: el job pasa a invocar `pnpm exec tsx` (en vez de `tsx` directo) para resolver el binario en el runner de CI.
- **Root routing 404 → redirect**: `middleware.ts` redirige `/` a `/${locale}/gimnasia-artistica` (primera modalidad del catalogo). Cierra el 404 de la raiz. **Decision arquitectonica** registrada en [[Decisiones#2026-06-26 - Routing raiz redirige a primera modalidad]].

## 2026-06-26 - Auditoria tecnica completa de seguridad y calidad (PR #8, commit `cf092ef`)

> El trabajo de auditoria (Bloques 1-4) se mergeo a `security/audit-remediation` via **PR #8 (`cf092ef`)**. El detalle por items 1.x–4.x sigue siendo correcto.

**Bloque auditoria (PR #8 `cf092ef`)**:

- **[1.1]** `src/app/api/academies/[academyId]/settings/route.ts:462` ya no expone `stripeSecretKey` en GET; devuelve `stripeSecretKeyConfigured: !!academy.stripeSecretKey` (boolean). Cierra vector MITM/DevTools.
- **[1.2]** PATCH /settings valida string vacio antes de sobreescribir clave Stripe; columna sigue plano (sin libsodium) — pendiente como deuda tecnica en Backlog.
- **[1.3]** `idempotencyKey` aplicado a `stripe.customers.create()` (`customer_${userId}`) y `stripe.checkout.sessions.create()` (`checkout_${user}_${plan}_${ts}`) en checkout-service y checkout route. Evita pagos duplicados por timeout.
- **[1.4]** Race condition en customer creation resuelto con `onConflictDoUpdate` sobre `subscriptions.userId` + re-lectura del customerId post-upsert. Patron atomico correcto.
- **[1.5]** Cron `daily-alerts` ya no hace N+1: una sola query con `inArray(profiles.tenantId, tenantIds)` + `inArray(role, [...])` agrupa por tenantId en Map antes de iterar.
- **[2.1]** Exposicion de `error.message` en API responses: bajada de 30+ a 11 ocurrencias residuales. `api-error-handler.ts` ya no filtra stack ni message al cliente; usa `instanceof Error` + mensajes genericos.
- **[2.2]** `withTenant` en `authz.ts`: solo `super_admin` puede operar sin tenantId; `admin` ahora lo requiere obligatoriamente. Pendiente endurecer con `verifyAcademyBelongsToTenant(academyId, tenantId)` (funcion existe en `permissions.ts` pero no se aplica en `withTenant`).
- **[2.4]** Stack trace eliminado de `api-error-handler.ts`. Detras de flag `ENABLE_DETAILED_ERRORS` si se quiere re-habilitar en dev.
- **[3.3]** `React.memo` aplicado a los 4 componentes criticos: `AthletesTableView`, `BillingPanel`, `EventForm`, `EditClassDialog`. Total de componentes memoizados: 17 -> 21.
- **[3.5]** `loading.tsx` skeletons: 2 -> 23 archivos (40% cobertura de 57 rutas en `app/[academyId]`). Pendiente cubrir las 34 restantes en sprint dedicado.
- **[3.6]** `any` en TypeScript: 357 -> 227 ocurrencias (-36%). Patron `catch (error: unknown)` + `instanceof Error` aplicado a 73+41 archivos. Quedan 227, mayoritariamente tipos de librerias externas.
- **[4.4]** Stripe client: `timeout: 10000` (10s) en `new Stripe(secretKey, ...)`. Evita requests colgados indefinidamente en `billing/sync`.
- **[4.2]** `src/lib/env.ts` ahora emite warning explicito en produccion si faltan `STRIPE_SECRET_KEY`, `DATABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY`. Sigue siendo `.optional()` en el schema Zod para no romper dev local.
- **[7ace38c]** Catch blocks de 500s en `authz.ts`, lemonsqueezy webhook, mailgun, generate-sessions: `error.message` eliminado del cliente. `LimitError instanceof` check en academies/athletes/groups. `WEEKDAY_OPTIONS` centralizado en `lib/classes/constants.ts` (2 componentes deduplicados). 14 `loading.tsx` adicionales en rutas audit-logs, assessments, messages, evaluations, licenses, my-events, comms, my-dashboard, coach, dashboard, support, notifications, whatsapp, reports.

**Puntos abiertos de la auditoria** (documentados en [[Backlog priorizado]]):

- [1.2] Encriptacion de claves Stripe en BD con libsodium (deuda tecnica).
- [2.2] `verifyAcademyBelongsToTenant` aplicado en `withTenant` para todos los roles.
- [2.3] Cross-check `invoice.customer === subscription.stripeCustomerId` en `billing/sync`.
- [2.5] Rate limit por tenantId en middleware (actualmente solo por IP).
- [2.6] Indice `(userId, academyId)` en memberships.
- [3.1/3.2] Refactor de `DashboardPage` (983 lineas), `EventForm` (862), `AthletesTableView` (772), `EditClassDialog` (767).
- [3.7] Constantes `WEEKDAY_OPTIONS`/`LEVEL_OPTIONS`/`RELATIONSHIP_OPTIONS` aun no en `i18n/es.json`/`en.json`.
- [3.8] Accesibilidad: aria-label/aria-hidden (76 referencias actuales, objetivo >200).
- [4.1] Migracion planificada para eliminar columna `athletes.groupId` (deprecated, 15+ usos activos).
- [4.3] Tests edge en webhooks (duplicados, metadata malformada, timeout).
- [4.5] Cron auth con verificacion de IP Vercel ademas de Bearer token.

**Validacion**: typecheck no ejecutado en este lote. Recomendado correr `pnpm typecheck && pnpm build` antes de mergear.

## 2026-06-24 - Consolidacion del vault (cierre de coherencia critica)

> **Retrospectiva 2026-06-26**: este commit (`06a71dd chore: cerrar coherencia critica de Zaltyko`) consolido 17 notas con fecha en sus versiones canonicas. No se documento en su momento. Se documenta aqui para trazabilidad.

**Notas eliminadas (17)**:

| Borrada                                                                        | Reemplazo canonico                                               | Info critica preservada                                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `vault/00-Inicio/Guia de trabajo para agentes.md`                              | `Workflow diario de la vault.md` + `Estado actual` + `AGENTS.md` | Si — reglas migradas                                                                                                |
| `vault/01-Producto/MVP exacto Zaltyko gimnasia.md`                             | `Inventario de producto.md`                                      | Si — consolidado                                                                                                    |
| `vault/01-Producto/Tarea - Sprint 0 decision v3.0.md`                          | `Inventario` + `Roadmap maestro` + `Pricing`                     | Parcial — los 6 bloques de implementacion especificos ya fueron ejecutados en `06a71dd`                             |
| `vault/01-Producto/Tarea - Onboarding y parent experience.md`                  | `Roadmap maestro` §Fase 3                                        | Parcial — referencia                                                                                                |
| `vault/01-Producto/Tarea - Skill tracking y make-up tokens MVP.md`             | `Roadmap maestro` + `Inventario`                                 | Parcial — referencia                                                                                                |
| `vault/03-Negocio/Tarea - Marketplace Zaltyko y multi-idioma.md`               | `Inventario` + `Roadmap` §Fase 4                                 | Parcial                                                                                                             |
| `vault/03-Negocio/Tarea - Pricing escalonado y plan gratis.md`                 | `Pricing.md` (v3.0) + `Decisiones.md`                            | Si — decision registrada                                                                                            |
| `vault/04-Marketing/Estrategia competitiva gimnasia.md`                        | `Competidores.md` + `Mensajes aprobados`                         | Si — absorbida                                                                                                      |
| `vault/04-Marketing/Matriz competitiva gimnasia.md`                            | `Competidores.md` (crecio 17 -> 434 lineas)                      | Si — absorbida                                                                                                      |
| `vault/05-Ventas-y-CS/Guia entrevistas academias gimnasia.md`                  | **Ninguno**                                                      | **NO — restaurada 2026-06-26** (preguntas + criterios de cierre no aparecen en Playbook demo ni Onboarding cliente) |
| `vault/06-Roadmap-y-Tareas/Cierre operativo pendientes agente - 2026-06-24.md` | `Roadmap maestro` + `Decisiones`                                 | Parcial — bloques de coherencia (pricing+portal, identidad+migraciones, legacy dashboard) perdidos como referencia  |
| `vault/06-Roadmap-y-Tareas/Plan operativo gimnasia.md`                         | `Roadmap maestro`                                                | Parcial                                                                                                             |
| `vault/07-Auditorias-y-Riesgos/Auditoria MVP gimnasia - 2026-06-23.md`         | `Auditorias consolidadas` + `Auditoria de producto real`         | Si — consolidada                                                                                                    |
| `vault/07-Auditorias-y-Riesgos/Auditoria copy publico - 2026-06-22.md`         | `Auditorias consolidadas` + `Mensajes aprobados`                 | Si — consolidada                                                                                                    |
| `vault/07-Auditorias-y-Riesgos/Auditoria de la vault - 2026-06-22.md`          | (obsoleta — vault reorganizada)                                  | Si — cerrada                                                                                                        |
| `vault/07-Auditorias-y-Riesgos/QA - Flujos P1 - 2026-06-22.md`                 | `QA - Flujos P1.md`                                              | Si — consolidada                                                                                                    |
| `vault/07-Auditorias-y-Riesgos/QA - Go Live SaaS - 2026-06-22.md`              | `Produccion y go-live.md`                                        | Si — consolidada                                                                                                    |

**Regla operativa violada y remediada**: AGENTS.md exige registrar todo cambio relevante (incluyendo consolidaciones) en `Decisiones.md` y `Changelog interno.md`. Esto se hizo recien el 2026-06-26 al auditar la rama `claude/hungry-shaw-f623bb`.

**Restauracion**: `Guia entrevistas academias gimnasia.md` restaurada el 2026-06-26 porque su contenido de discovery (perfil objetivo, 18 preguntas, criterios de cierre de 10 entrevistas) no aparece en `Playbook de demo.md` ni `Onboarding de cliente.md`. Quedan en [[Backlog priorizado]] los cruces pendientes con [[Buyer personas]] y [[Objeciones y respuestas]].

## 2026-06-24 - Sprint 7 Form refactor + i18n + Deuda tecnica

- **Sprint 7A.2 RHF+Zod en CreateClassDialog** (`src/components/classes/CreateClassDialog.tsx`): zod schema con `weekdays[]`/`apparatus[]`, useForm + zodResolver, Controller para Switch, defaultValues separados, errores per-field con role=alert, min-h-11 en botones. **Leccion**: usar `z.input<>` y `?? []` en watch; `.default([])` rompe el Resolver types de RHF (lesson aprendida en 7A.1 tambien).
- **Sprint 7A.3 RHF+Zod en EventForm** (`src/components/events/EventForm.tsx`): schema para 25+ campos (titulo, fechas, location, contactos, capacidades, notificaciones), Controller para LocationSelect/FileUpload/Switch, valueAsNumber para numeros, manejo custom de `competitionTypeCode` vs `eventType` segun sportConfig seleccionado, reset cuando cambia evento externo.
- **Sprint 7A.4 OnboardingChecklist**: evaluado y descartado para RHF. Es un widget sin form submission, el `useState` + fetch es el patron correcto. Documentado en [[Backlog priorizado]].
- **Sprint 7B.1 i18n en DashboardPage** (`src/components/dashboard/DashboardPage.tsx`): 3 KPIs localizadas (kpiCoaches, kpiGroups, kpiAttendance) consumiendo `useTranslation` + `locale`. 962 lineas sin tocar logica de negocio.
- **Sprint 7B.2 i18n en AthletesTableView** (`src/components/athletes/AthletesTableView.tsx`): 3 keys (`search`, `cancel`, `delete`) aplicadas a placeholder, option de menu y boton.
- **Sprint 7B.3 i18n en BillingPanel** (`src/components/billing/BillingPanel.tsx`): `getInvoiceStatusInfo` ahora recibe `locale` y traduce 6 estados (paid/pending/overdue/cancelled/draft/trialing).
- **Validacion**: `node_modules/.bin/tsc --noEmit --skipLibCheck` pasa limpio en los 5 archivos. ESLint solo reporta warnings pre-existentes. **5 commits nuevos** (bf8a937, c834473, 6ff8636, 8f72b9f, d9d3dbc) sobre main, sin regresiones.
- **Pendiente Sprint 7C/D**: setup Supabase local CLI (requiere Docker, no automatizable en este entorno sin decision); documentar y ejecutar decision `/dashboard` legacy redirects. Cerrar en sesion separada.

## 2026-06-23 - Sprint 0 (Quick Wins) ejecutado

- **Sitemap con fallback**: `next-sitemap.config.js` ahora usa `NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` para evitar URLs `undefined` si la variable no esta definida al ejecutar `pnpm sitemap`.
- **Contraste WCAG AA**: `text-light` en `tailwind.config.ts` cambia de `#94A3B8` (2.5:1 sobre blanco, falla AA) a `#64748B` (4.6:1, pasa AA). Aplica a 17 usos en billing components.
- **PWA theme_color alineado**: `public/manifest.json` `theme_color` pasa de `#0D47A1` (azul) a `#0F172A` (navy brand). Coherente con `layout.tsx:120` y `viewport.themeColor`.
- **Toggle anual claramente no comprable**: `src/app/(site)/pricing.tsx` invierte el toggle: "Mensual" se muestra activo (`aria-pressed="true"`) y "Anual" se muestra deshabilitado (`aria-disabled="true"`, `cursor-not-allowed`, `title` explicativo). Hasta que exista `stripePriceId` anual real en DB/Stripe, no se puede seleccionar.
- **Mailgun timing-safe**: `src/app/api/mailgun/route.ts` ahora compara firmas con `crypto.timingSafeEqual` sobre `Buffer.from(hash, "hex")` en vez de `hash !== signature`. Cierra vector de timing attack.
- **Validacion**: `pnpm typecheck` y `pnpm lint` pasan limpios. Sin regresiones en typecheck ni en eslint rules de la app.
- **Cierre de 4 quick wins + 1 accesibilidad** del plan maestro. Sin cambios de precio ni limites reales. Próximo: Sprint 1 (Seguridad CRITICAL).

## 2026-06-23 - Sprint 1 (Seguridad CRITICAL) ejecutado

- **C1 RLS `academy_link_requests`**: nueva migracion `supabase/migrations/20260624000000_rls_academy_link_requests.sql` con `ENABLE ROW LEVEL SECURITY` + 2 policies (`tenant_or_target_access` y `target_response`). Grant a `authenticated` y `service_role`. `pnpm validate:rls` ahora reporta **100% cobertura sobre 63 tablas tenant-scoped**.
- **C2 Middleware consolidado**: `proxy.ts` eliminado y su logica migrada a `middleware.ts`. El nuevo matcher cubre todas las rutas excepto static/favicon. Rate-limit global API mutante ahora se ejecuta fiablemente (antes dependia de `proxy.ts` que no es convencion Next.js estandar). Tambien rate-limita `/app/*` y `/super-admin/*`.
- **C3 JWT firma HMAC**: `middleware.ts` ahora verifica la firma HS256 del access token contra `SUPABASE_JWT_SECRET` con `crypto.timingSafeEqual` antes de validar `app_metadata.role`. Cierra el vector de aceptar tokens con firma invalida o manipulada en `/super-admin/*`. Fail-closed: si la env var falta, rechaza el acceso.
- **H4 ESLint en build**: `next.config.mjs` `eslint.ignoreDuringBuilds` pasa de `true` a `false`. Builds fallan si hay errores de lint.
- **T4 Smoke-test en CI**: job `smoke-test` descomentado y configurado en `.github/workflows/ci.yml`. Ejecuta `pnpm exec playwright install --with-deps chromium` + `tsx smoke-test.ts` contra `https://zaltyko.vercel.app`. Solo corre en `push` a `main` (no en PRs).
- **T5 Validate RLS en CI**: nuevo job `validate-rls` en `.github/workflows/ci.yml` que ejecuta `pnpm validate:rls` en cada push/PR. Falla el CI si la cobertura RLS baja del 100%.
- **Limpieza `package.json`**: scripts `lint:app` y `lint:fix` ya no referencian `proxy.ts` (eliminado).
- **Validacion**: `pnpm typecheck`, `pnpm lint` y `pnpm validate:rls` pasan limpios. Cierre de 6 issues CRITICAL/HIGH pre-produccion. Sin cambios funcionales visibles al usuario fuera del toggle anual. Próximo: Sprint 2 (Base de Datos).

## 2026-06-24 - Fix Vercel deploy: ESLint flat config + hreflang undefined

**Bug 1: ESLint v8 + flat config incompatible con Next.js 15.5**

- `eslint.config.mjs` (flat config con `FlatCompat`) hacia que Next.js pasara
  opciones legacy `--useEslintrc` y `--extensions` durante el build.
- ESLint v8.57.1 las rechaza cuando detecta flat config.
- Error: `ESLint: Invalid Options: - Unknown options: useEslintrc, extensions -
'extensions' has been removed.`
- Solucion: reemplazar `eslint.config.mjs` por `.eslintrc.json` legacy.
  Reglas react-hooks v5+ removidas (no existen en v4 instalada).
- Build ahora procede correctamente el step de ESLint.

**Bug 2: hreflang undefined en cluster pages (regresion Sprint 5 F12)**

- `MODALITIES[modality as ModalitySlug].en` con `modality = "artistic-gymnastics"`
  devolvia `undefined` (la clave es `"artistic"`, no el slug).
- Fallaba en build pero dev server silenciaba con error boundary client-side.
- Error real: `TypeError: Cannot read properties of undefined (reading 'en')`.
- Solucion: usar `modalityKey` y `countryKey` ya calculados (que SI son las
  claves) en vez del slug directo.

**Validacion**: `pnpm build` EXITOSO en 200s, 207 paginas pre-renderizadas.

**Deploy**: commit `5c77418` pusheado a main. Vercel auto-deploy deberia funcionar.

## 2026-06-24 - Sprint 6 (Code Splitting + Producto + Deuda tecnica + Validacion) ejecutado

**Sprint 6A - Code Splitting agresivo + form refactor:**

- **6A.1 Touch targets**: aplicado script Python selectivo que solo convierte h-9 w-9 / h-8 w-8 en contexto de <Button> (no SVGs como Loader2). 1 archivo adicional migrado.
- **6A.2 F6 RHF + Zod**: `QuickClassModal.tsx` migrado de useState+FormEvent a react-hook-form + zodResolver. Nuevo `quickClassSchema` (uuid + regex date) con validacion declarativa. Errors per-field con role=alert. submitError separado. min-h-[44px] en inputs/botones. Deps: +@hookform/resolvers 5.4.0.
- **6A.3 F7 i18n keys**: nuevo `src/i18n/extras.ts` con secciones common, dashboard, athletes, billing, classes, events, navigation (~80 keys bilingues). Helper `getExtraTranslations(locale)`. Pendiente migrar componentes individuales.
- **6A.4 Code splitting**: nuevo `EventsListLazy.tsx` con next/dynamic (ssr: false). `src/app/app/[academyId]/events/page.tsx` usa EventsListLazy. Loading state animate-pulse.

**Sprint 6B - Producto:**

- **6B.1 P3 comunicacion consolidada UI**: nuevo `/app/[academyId]/comms/page.tsx` + `CommunicationHub.tsx` con 3 tabs (Mensajes / Anuncios / Notificaciones). Cada panel carga via next/dynamic. States: loading/empty/error. ARIA: role=tablist/tab/tabpanel, aria-selected, aria-controls. min-h-[44px]. Paginas originales (/messages, /announcements, /notifications) siguen como deep links.
- **6B.2 P1/P2**: documentados en vault como pendientes no automatizables (decision humana + QA con usuarios).

**Sprint 6C - Deuda tecnica:**

- **6C.3 Policies permisivas endurecer**: migracion `20260625000002_harden_permissive_policies.sql` reemplaza `allow_authenticated` por policies especificas en: marketplace_listings, marketplace_ratings, empleo_listings, empleo_applications, tickets, ticket_responses, ticket_attachments, advertisements, featured_listings, push_subscriptions. Filtros por user_id, academy_id, o admin.
- **6C.1 + 6C.4 Tablas criticas faltantes**: migracion `20260625000003_create_critical_missing_tables.sql` crea con FKs, indices y RLS: event_registrations, event_waitlist, event_categories, event_payments, class_waiting_list, athlete_documents. Resuelve 6 de las 25 tablas TS que faltaban en DB.
- **6C.2 Migraciones pendientes**: tras analisis, todas las migraciones del filesystem estan aplicadas a Supabase. Sin accion requerida.

**Sprint 6D - Validacion pre-produccion:**

- **6D.1 pg-mem vs testcontainers**: Sprint 6 intento quitar `api-billing.test.ts` del exclude de vitest, pero los mocks vi.hoisted estan incompletos (1/3 pasa). El exclude original era justificado. Documentado en vitest.config.ts.
- **6D.2 testcontainers**: no implementado (requiere decision arquitectonica mayor: pg-mem con shim RLS, testcontainers, o Supabase local en CI). Pendiente para sprint dedicado.

**Validacion final**: validate:rls PASS 100% (63 tablas + 6 nuevas con RLS), check:migrations OK, tsc OK, vitest 353/353 PASS en tests incluidos. 2 tests pre-existentes fallan en `product-go-live-readiness.test.ts` (academiaLimit null en catalog y feature "acompanado" no aparece), no relacionados con Sprint 6.

## 2026-06-23 - Sprint 5 (Frontend + Negocio) ejecutado

**Frontend:**

- **F5 memoizacion**: 6 cluster sections (ClusterAcademies/Coaches/Events/Hero/CTA/Interlinking) y 4 dashboard widgets (KPISection, RecentActivity, UpcomingClasses, QuickActions) envueltos con `memo()`. Cada componente renombrado a `XImpl` y exportado como `memo(XImpl)` para mantener compat con imports nombrados. Reduccion esperada de re-renders en cluster pages y dashboard academy.
- **F8 lazy load DashboardPage**: `next/dynamic` en `src/app/app/[academyId]/dashboard/page.tsx` carga DashboardPage (942 lineas, ~30 widgets) con code-splitting. Skeleton `DashboardPageSkeleton` muestra placeholder animado durante carga. Reduccion estimada del bundle inicial del segmento dashboard en ~70%.
- **F10 touch targets**: 3 botones icon-only en `DashboardTopbar` (notificaciones, ayuda, opciones) cambiados de `h-9 w-9` (36x36) a `min-h-[44px] min-w-[44px] h-11 w-11` (44x44px). Cumple WCAG 2.5.5. Otros 59 botones pequenos en el resto de componentes quedan como follow-up.
- **F12 hreflang en cluster pages**: metadata `alternates.languages` ahora declara versiones ES y EN de cada cluster `[locale]/[modality]/[country]`. Mejora SEO internacional sin duplicar URLs canónicas.
- **F6/F7 diferidos**: RHF+Zod en 5 dialogos criticos y extraccion i18n del dashboard requieren refactor profundo. Quedan como P1 para sprints dedicados.

**Negocio:**

- **P3 comunicacion interna consolidada**: `/api/messages/send` ya consolida busqueda/creacion de conversacion + envio + in-app notification + push notification. Disparadores existentes desde Contactos de atleta y desde detalle de grupo ya operativos. Pendiente: consolidar announcements + mensajes + notificaciones en un solo centro de UI con tabs.
- **P4 clase de hoy para coach**: nuevo `src/components/coach/TodayQuickActions.tsx` con 3 acciones inline (pasar asistencia, evaluar progreso, aviso al grupo). Cada accion es un Link directo con `min-h-[44px]`. Empty state cuando no hay sesion. Pendiente: integrarlo en `CoachDashboardPage.tsx` pasando `todaySession` (ya disponible como prop).
- **P1 decision legacy `/dashboard/*`**: opciones A/B/C/D ya analizadas en `Decisiones.md`. PENDIENTE Elvis (requiere eleccion humana entre compatibilidad vs migracion).
- **P2 QA portal padres con usuarios reales**: implementado tecnicamente (allowlist + redirect + clean links). PENDIENTE sesion de prueba con `parent`/`athlete` reales para validar UX end-to-end. No automatizable.
- **P5 pricing freemium (10 entrevistas)**: 10 sesiones con academias siguen PENDIENTES. Hipotesis free + Growth + Pro documentada en `Pricing.md`. Sin automatizar; requiere coordinacion con equipo de growth.

**Validacion**: typecheck OK, lint OK, validate:rls PASS 100%, check:migrations OK, vitest 353/353 PASS (37 archivos, sin regresiones).

## 2026-06-23 - Sprint 4 (Testing) ejecutado

- **T2 placeholders eliminados**: `tests/components-critical.test.tsx` ahora tiene 10 tests reales con React Testing Library + user-event + jest-dom. Reemplaza los 20 placeholders `expect(true).toBe(true)`. Cubre FormField (5 tests: render, error externo, required, email, minLength) y ConfirmDialog (5 tests: render, onConfirm, onCancel, variant destructive, loading state).
- **T11 integridad de migraciones**: nuevo `scripts/check-migrations-integrity.ts` y `pnpm check:migrations`. Verifica journal consistency (SQL + snapshot por entrada). Job CI `check-migrations` añadido. Drift Drizzle via `db:generate` sigue requiriendo DB real - queda como follow-up.
- **T7 Playwright parallel + cross-browser**: `playwright.config.ts` con `fullyParallel: true` en CI, `workers: 3`, `maxFailures: 5`. Proyectos: chromium, firefox, webkit. Reporter `github` para annotations en PRs.
- **T8 coverage a Codecov**: job `test` ahora corre `pnpm vitest run --coverage` y sube `coverage/lcov.info` a Codecov via `codecov-action@v4`. Requiere `CODECOV_TOKEN` secret.
- **T10 E2E en CI**: jobs `e2e-public` y `e2e-auth` con secrets `E2E_*`. Solo corren en push a main. Generan storage state antes de correr tests autenticados.
- **T6 tests de validators**: `tests/validators.test.ts` con 19 tests cubriendo required, email, minLength, maxLength, pattern y combine. Reusable para todos los formularios que usen `FormField`/`validators`.
- **Deps nuevas**: `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react@4.3.4`.
- **Vitest config**: setup file importa `@testing-library/jest-dom/vitest` para matchers. Tests `*.tsx` soportados via `@vitejs/plugin-react`.
- **Difierido**: T1 (pg-mem para 17 tests API excluidos) y T3 (testcontainers para tenancy) requieren setup de DB de prueba; se abordan en sprint dedicado cuando se decida estrategia de test DB.
- **Validacion**: `pnpm typecheck`, `pnpm lint`, `pnpm validate:rls` (PASS 100%), `pnpm check:migrations` (3 migraciones), `pnpm vitest run tests/components-critical.test.tsx tests/validators.test.ts` (29 tests pasan).

## 2026-06-23 - Sprint 3 (Arquitectura y DX) ejecutado

- **A3 i18n middleware consolidado**: `src/middleware-i18n.ts` (que Next.js nunca cargaba) eliminado. Logica de i18n redirect migrada a `middleware.ts` raiz con deteccion de locale por cookie/Accept-Language. Orden: exclude paths -> i18n redirect -> rate-limit API mutante -> rate-limit /app y /super-admin -> super-admin gate JWT con firma HS256.
- **A7 AuthorizationError consolidado**: `src/lib/authz/errors.ts` ahora extiende la jerarquia `AppError` de `src/lib/errors.ts`. Re-exporta `AppAuthorizationError` para compatibilidad. `src/lib/authz.ts` actualizado para usar `error.statusCode` (campo AppError) en vez de `error.status`. Una sola clase, un solo `instanceof` check.
- **A8 tracesSampleRate reducido**: `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` ahora usan `tracesSampler` con logica: 100% en errores 5xx, 10% en 2xx/3xx, 0% en `/api/stripe/webhook` y `/api/cron`. `replaysSessionSampleRate` reducido de 0.1 a 0.05 en cliente. Cierra riesgo de saturar quota Sentry en produccion.
- **A4 withErrorHandler mejorado**: ahora soporta el patron `withErrorHandler(withTenant(handler))` para composicion. Reconoce `AppError` (statusCode explicito) primero, luego ZodError, luego genericos. Acepta `RouteContext` con params Promise (Next.js 15). Aplicado como ejemplo en `/api/audit-logs/route.ts` con `apiSuccess`.
- **A1 withBearerTenant nuevo wrapper**: `src/lib/authz.ts` ahora exporta `withBearerTenant` que resuelve userId desde `Authorization: Bearer <token>` via `supabase.auth.getUser(token)` en lugar de cookies. Mantiene misma signature de contexto. Aplicado como ejemplo en `/api/push-tokens/route.ts` con `withErrorHandler(withBearerTenant(handler))`. Patron listo para migrar las 14 APIs bearer restantes en sprints siguientes.
- **A6 capa de repositorios iniciada**: `src/db/repositories/athletes.ts` con `listForAcademy`, `countForAcademy`, `findById`. Filtra siempre por `tenantId` (defensa en profundidad ademas de RLS). Patron para replicar a classes, events, billing, etc. en siguientes sprints.
- **Validacion**: `pnpm typecheck`, `pnpm lint` y `pnpm validate:rls` (PASS 100% sobre 63 tablas) limpios. Sin cambios visibles al usuario final.

## 2026-06-23 - Sprint 2 (Base de Datos) ejecutado parcialmente

- **S6 SELF_SIGNED_CERT_IN_CHAIN resuelto**: certificado CA raiz de Supabase extraido a `certs/supabase-root-ca.crt` (publico, commiteado al repo). `drizzle.config.ts` ahora carga `.env.local` ademas de `.env`. Nuevo script `scripts/db-migrate.ts` resuelve `NODE_EXTRA_CA_CERTS` a ruta absoluta y ejecuta `drizzle-kit push` con env vars correctas. `scripts/dump-schema.ts` y `scripts/check-fks.ts` con SSL fix para diagnostico. `scripts/apply-migration.ts` ya funcionaba en `NODE_ENV=production` por su `ssl: { rejectUnauthorized: false }`. `.env.example` documenta `NODE_EXTRA_CA_CERTS`.
- **S3 drift Drizzle↔SQL parcialmente cerrado**: `pnpm db:migrate` ahora conecta. Dump del schema real revela que **25 tablas del schema TS NO EXISTEN en DB** (academy_link_requests creado en Sprint 1, academy_roles, assessment_rubrics, athlete_documents, class_exceptions, class_waiting_list, competition_results, event_categories, event_payments, event_registrations, event_waitlist, federative_licenses, leads, leak_action_history, message_groups, message_history, message_templates, notification_preferences, push_tokens, role_members, rubric_criteria, scheduled_notifications, scheduled_reports). Migracion `20260625000000_apply_pending_migrations.sql` crea el modulo leak-profitability (academy_diagnostics, academy_expenses, churn_reasons, coach_compensation) que estaba pendiente desde 0001 y registra 0001/0002 en `__drizzle_migrations`. Drift menor en `academy_diagnostics` (score/yes_count) queda documentado.
- **S4 añadir tablas faltantes DIFERIDO**: `drizzle-kit push --force` propone cambios destructivos (borrar `__drizzle_migrations`, truncar tablas, cambiar PK). Requiere plan de migracion manual tabla por tabla. Backlog P0 para sprint dedicado.
- **S2 RLS modulos laterales cerrado**: migracion `20260625000001_rls_lateral_modules.sql` habilita RLS en `announcements`, `announcement_read_status`, `conversation_messages`, `conversation_participants`, `message_read_receipts` con policies por tenant/user. Tablas con policy permisiva `allow_authenticated` documentadas en backlog para endurecer (marketplace*\*, empleo*\_, tickets\_\_, advertisements, featured_listings, push_subscriptions).
- **S5 mover claves Stripe a Vault DIFERIDO**: `supabase_vault` extension instalada y disponible. `academies.stripe_secret_key` y `academies.stripe_webhook_secret` existen como columnas pero 0 academias tienen datos. Las claves Stripe de Zaltyko (cuenta SaaS) estan en env vars, no en la tabla. Backlog P1 para cuando se implemente Stripe Connect por academia.
- **Validacion**: `pnpm typecheck`, `pnpm lint` y `pnpm validate:rls` (PASS 100% cobertura sobre 63 tablas) limpios. 2 migraciones SQL nuevas aplicadas a Supabase. Sin cambios de UI.

## 2026-07-07 - Segunda tanda hardening demo/roles

- Confirmado bloqueo real de E2E autenticado: las credenciales `E2E_AUTH_*` actuales no autentican en Supabase Auth (`Invalid login credentials`), por lo que no se pudo regenerar `.auth/user.json`.
- Agregado smoke E2E minimo por rol (`tests/e2e-role-smoke.spec.ts`) para super admin, owner y coach; queda preparado y salta explicitamente hasta tener storage states validos.
- Endurecido permiso de coach en asistencia/progreso: `/api/attendance` y `/api/assessments` validan clase/atleta asignado mediante helpers centralizados en `src/lib/permissions.ts`, `src/lib/attendance/service.ts` y `src/lib/progress/service.ts`.
- Endurecido scoping familiar inicial: `/api/family/children` usa `getFamilyChildrenForUser()` con rol familiar, tenant y relaciones permitidas; quedan endpoints familiares/bearer restantes para una pasada posterior.
- Eliminado `src/app/app/[academyId]/my-dashboard/page.js` duplicado tras validar que `page.tsx` mantiene la ruta y `pnpm build` pasa.
- Preparado dataset demo dev-session para Espana: academia, gimnastas, grupo, clase, entrenadores, asistencia, cobros internos y progreso. Smoke HTTP owner paso en dashboard, gimnastas, grupos, clases, cobros, settings y my-dashboard.
- Validacion actual: `pnpm exec tsc --noEmit --pretty false` PASS, `pnpm lint` PASS, `pnpm exec vitest run` PASS (40 archivos, 358 tests), `pnpm build` PASS (201 paginas).

## 2026-06-23

- Creada estrategia competitiva para gimnasia artistica/ritmica con comunicacion interna primero y WhatsApp secundario/futuro.
- Creada matriz competitiva inicial de 10 competidores y documento draft de MVP exacto Zaltyko gimnasia.
- Actualizados pricing, mensajes aprobados, competidores, backlog y decisiones para reflejar hipotesis freemium accesible sin cambiar precios ni limites reales.
- Iniciada investigacion competitiva operativa: matriz ampliada con Pike13, WellnessLiving, Clupik pricing, senales de reviews publicas y dolores por area. Pricing actualizado con hipotesis de empaquetado Free/Growth/Pro a validar.
- Auditado MVP real contra codigo: detectado bloqueo probable del portal moderno de padres/atletas por `canAccessAcademyWorkspace`; creado backlog P0 para resolver acceso limitado seguro y backlog P1 para comunicacion interna/flujo entrenador.
- Creado [[Plan operativo gimnasia]] con fases de ejecucion y [[Guia entrevistas academias gimnasia]] para validar dolores, MVP y pricing con 10 academias.
- Implementado primer desbloqueo tecnico del portal padres/atletas: allowlist de rutas limitadas en `/app/[academyId]`, home moderno para parent/athlete, navegacion limitada, redirect de invitacion/home a `my-dashboard` y tests de roles/flujo critico actualizados.
- Limpiados enlaces internos del panel personal que apuntaban a rutas administrativas (`billing`, `attendance`, `assessments`, `calendar`, `athletes`) y retirado CTA directo de WhatsApp para sostener comunicacion interna primero.
- Conectada `/app/[academyId]/messages` al centro interno de mensajes directos para perfiles `parent`/`athlete` miembros; owners/admin mantienen la bandeja de mensajes de contacto publicos.
- Agregado primer disparador operativo de comunicacion interna familiar: desde Contactos del detalle de atleta, staff puede abrir/crear una conversacion interna validada con un tutor que tenga acceso al portal.
- Agregado disparador de comunicacion interna por grupo: desde el detalle de grupo, staff puede abrir/crear una conversacion con los tutores del grupo que ya tienen acceso al portal.
- Implementado registro abierto por rol inicial (`owner`, `coach`, `parent`, `athlete`, `provider`), perfil global al confirmar/callback de auth, rutas globales por rol y soporte inicial para proveedores en marketplace.
- Registrada decision de identidad global + vinculos aceptados por academia; backlog actualizado con la entidad pendiente de solicitudes de vinculo a usuarios existentes.
- Implementada base tecnica de solicitudes de vinculo a usuarios existentes: tabla `academy_link_requests`, busqueda por email exacto via `auth.users`, creacion pendiente por academia, notificacion interna y aceptacion/rechazo por el usuario con creacion de `membership`.
- Agregada UI basica de solicitudes de vinculo: staff puede crear solicitudes desde `/dashboard/users`, ver solicitudes pendientes y usuarios globales pueden aceptar/rechazar desde su perfil.
- Implementada desvinculacion segura de usuarios por academia: `DELETE /api/academy-memberships/[membershipId]` elimina solo `membership`, conserva `profiles`, limpia `activeAcademyId` si aplica, notifica al usuario y bloquea auto-desvinculacion/ultimo owner. UI conectada en `/dashboard/users`.
- Ejecutado smoke Playwright autenticado de solicitudes de vinculo: migraciones `20260623100000_add_provider_profile_role.sql` y `20260623103000_create_academy_link_requests.sql` aplicadas en sandbox; `tests/e2e-link-requests-ui.spec.ts` PASS en Chromium validando `/dashboard/users` y `/dashboard/profile`.
- Conectado email opcional para solicitudes de vinculo ademas de notificacion interna; si Brevo/email falla, la solicitud no se rompe y queda logueada la incidencia.
- Corregido onboarding de perfil para aceptar `provider` desde `/auth/register`; smoke Playwright publico valida los 5 roles iniciales.
- Registrada decision de mantener `membership_role` simple en v1 (`owner`, `coach`, `viewer`) y mapear `admin` global a acceso de owner hasta necesitar permisos granulares.
- Estado real: faltan QA manual con dos usuarios reales, validacion de cuentas reales por rol y barrido completo de copy "borrar" vs "desvincular" en pantallas especificas de atletas/tutores/entrenadores.

## 2026-06-24 - Migraciones produccion aplicadas y verificadas

- Aplicadas en Supabase produccion `jegxfahsvugilbthbked`: `20260622153000_add_sport_config_rls.sql` y `20260624000000_rls_academy_link_requests.sql`.
- Verificado que las piezas criticas ya estan presentes en produccion: columnas de assessments, campos comerciales de clases, `billing_invoices`, role `provider`, `academy_link_requests`, tablas leak-profitability, RLS lateral, policies endurecidas de marketplace/empleo/push y tablas criticas de eventos/documentos.
- Corregida la migracion RLS de `academy_link_requests`: `get_current_profile()` devuelve `profiles`, asi que las policies deben comparar `target_profile_id` con `(get_current_profile()).id`.
- `pnpm check:migrations` sigue en verde. No se hizo push ni cambios en Stripe productivo.

## 2026-06-24 - Limpieza warnings Vercel build

- Eliminado `vercel` como devDependency porque Vercel lo ignora en builds remotos y el workflow ya instala el CLI globalmente.
- Convertido `tailwind.config.ts` a `tailwind.config.mjs` para evitar el warning ESM/CJS al cargar Tailwind en Vercel.
- Corregido CI: `pnpm/action-setup` ya no fija `version: 9` porque `package.json` define `packageManager` con `pnpm@9.15.3`.
- `pnpm lint` y `pnpm build` pasan; quedan solo warnings historicos de lint no bloqueantes.

## 2026-06-24 - Cierre CI PR coherencia critica

- Ancladas como devDependencies directas `playwright` y `@vitest/coverage-v8` para que `pnpm typecheck`, scripts E2E y `pnpm vitest run --coverage` no dependan de transitive deps en CI.
- `scripts/check-migrations-integrity.ts` ahora soporta runners sin carpeta local `drizzle/`: valida `supabase/migrations` y mantiene la validacion Drizzle completa cuando `drizzle/meta/_journal.json` existe.
- Corregido `tests/api-academy-settings-sport-config.test.ts`: mock de `logger`, cadenas Drizzle mockeadas con `groupBy`, forma correcta de `apparatus` y timeouts locales para coverage de ruta Next pesada.
- `coverage/` queda ignorado como artefacto local de pruebas.
- Validacion local final: `pnpm typecheck`, `pnpm lint`, `pnpm check:migrations`, `pnpm vitest run --coverage` (39 archivos, 376 tests) y `pnpm build` pasan.
- Fix adicional de CI Build: onboarding `parent`/`athlete`/`coach` crea el cliente Supabase solo en `handleFinish`, evitando que el prerender falle cuando el runner no tiene `NEXT_PUBLIC_SUPABASE_URL`/anon key.
- Validado con `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= pnpm build`.

## 2026-06-22

## 2026-06-22 - Cierre Go-Live SaaS v1 con sandbox real

- Ejecutado QA P1 real contra Supabase sandbox: `tests/e2e-zaltyko-p1-flows.spec.ts` **5/5 PASS** en 9.7 min con academia `9ec3ea79-73e9-4604-8e4a-ddf1d6469cbb` y storage state `.auth/user.json`.
- Endurecido E2E P1 para crear datos minimos: atleta, clase, enrollment, sesion, evaluacion, asistencia, reporte/export, comunicacion y billing base.
- Corregido fallback local de rate limit cuando faltan variables KV, manteniendo fail-closed en produccion.
- Corregidos bugs detectados por QA real: compatibilidad `classes.weekday`, conteo de `class_enrollments`, `rubric_id` en assessments, params opcionales null en comunicacion, placeholder Stripe en checkout y schema `billing_invoices`.
- Aplicadas/sincronizadas migraciones sandbox: technical guidance, assessments, sport config RLS, class commercial fields y billing invoices.
- Backlog P1 actualizado a Resuelto para onboarding/trial, evaluaciones, asistencia/reportes y comunicacion consolidada dentro del alcance v1.
- Riesgo residual documentado: cobro self-serve masivo requiere price real Stripe y corrida webhook/portal/upgrade/downgrade/cancel/past_due; mientras haya placeholders, checkout degrada a `STRIPE_NOT_CONFIGURED`.

## 2026-06-22

## 2026-06-22 - Cierre de bugs P1 y actualizacion de QA

- Auditoria completa de la vault (51 notas, 0 links rotos, 8 huerfanos legitimos). Notas nuevas: `Auditoria de la vault - 2026-06-22`, `Auditoria copy publico - 2026-06-22`, `QA - Flujos P1 - 2026-06-22`.
- Bug A CERRADO: `/api/reports/attendance/export` ahora responde 200 + PDF. Fix: quitar `academyId` del schema (ya viene de `withTenant`) y permitir `null` en params opcionales con `.nullable().optional()`. Ajuste posterior: `?? undefined` en `filters` para que tsc acepte.
- Bug B CERRADO: `/app/[id]/athletes/[athleteId]/assessments` ya no muestra "Failed query". Causa: DB desincronizada con schema TS (faltaban `assessment_type`, `total_score`, `tenant_id`). Fix: nueva migracion `supabase/migrations/20260622140000_sync_athlete_assessments_schema.sql` aplicada via `scripts/apply-migration.ts`.
- Bug C CERRADO: caracteres chinos `提醒` en `FeaturesSection.tsx:130` sustituidos por "recordatorios".
- Bug D CERRADO: paginas publicas (`marketplace`, `empleo`, `events`) ya no apuntan a `/dashboard/*` legacy. `/api/auth/check` ahora devuelve `academyId`; `PublicPageHeader` usa `dashboardHrefTemplate` con placeholder `{academyId}`.
- Suite E2E `tests/e2e-zaltyko-p1-flows.spec.ts`: **3/3 PASSED** en 1 minuto.
- Suite E2E `tests/e2e-zaltyko-full.spec.ts`: **10/10 PASSED** en ~7.6 min (6 tests rapidos 3.5 min + 4 tests pesados 4.1 min). Genera screenshots responsive en `test-results/sprint-3/`.
- Typecheck investigado: **no es tsc el problema del build**. `pnpm typecheck` termina en 13s limpio y pasa sin errores (incluyendo los fixes de Bug A). El `pnpm build` se cuelga en una fase posterior (probable static generation de rutas dinamicas). No bloquea dev ni QA.
- Decision pendiente: rutas legacy `/dashboard/*` (opciones A/B/C/D registradas en `Decisiones.md` con pros/contras). Pendiente de Elvis.
- Decisiones pendientes adicionales: cifras del Hero, pricing anual, testimonios, FAQ retencion 30 dias.

## 2026-06-22

- Creada vault Obsidian versionada en `vault/`.
- Añadida estructura operativa para producto, tecnologia, negocio, marketing, ventas, roadmap, auditorias y referencias.
- Definida regla: cambios relevantes deben actualizar vault.
- Ejecutados los primeros 5 pasos de operativizacion: estados corregidos, pricing auditado, backlog convertido en tareas, auditoria de producto real y workflow diario documentado.
- Corregido downgrade Stripe pago -> pago para usar subscription item real.
- Corregida paginacion de notificaciones.
- Añadido checklist QA para evaluaciones, asistencia y onboarding.

## 2026-06-22 - Go-live SaaS v1

- Growth queda limitado a 1 academia en v1 comercial; Network conserva multi-sede solo con onboarding acompanado.
- Eliminadas promesas vendibles de "academias ilimitadas" en Growth y actualizado pricing/copy de marketing.
- Agregado guardrail `tests/product-go-live-readiness.test.ts` para feature flags apagadas y posicionamiento de planes.
- Ampliado `tests/e2e-zaltyko-p1-flows.spec.ts` con smoke de comunicacion y billing.
- Agregada migracion `20260622153000_add_sport_config_rls.sql`; `pnpm validate:rls` pasa con 62 tablas tenant y 100% de cobertura.
- Registrada decision en [[Decisiones#2026-06-22 - V1 comercial con una academia por cliente]] y checklist en [[QA - Go Live SaaS - 2026-06-22]].
- Configurado E2E autenticado local: usuario owner, academia fixture, storage state de Playwright ignorado por git y suite `pnpm test:e2e` en verde con 10 tests.
- Preparado deploy Vercel: `pnpm build` pasa, ESLint queda como validacion explicita con `pnpm lint`, TypeScript sigue bloqueando build y `.vercelignore` excluye `.env*`/`.auth`.

## Como actualizar

Registrar cambios humanos y relevantes: releases, decisiones, cambios de pricing, nuevas features, cambios de arquitectura, migraciones importantes, hallazgos de auditoria y riesgos cerrados.

## 2026-07-09 - Auditoria E2E roles y a11y autenticada

- Regeneradas y verificadas sesiones Playwright E2E para owner, coach y super-admin; `tests/e2e-role-smoke.spec.ts --project=chromium --workers=1` pasa 3/3.
- Corregidos fallos axe autenticados en dashboard/athletes: nombres accesibles de progressbar/selects, contraste de sidebar/topnav/widgets/badges y estados de tabla.
- `tests/a11y-zaltyko.spec.ts --project=chromium --workers=1` pasa 4/4 incluyendo dashboard y athletes autenticados.
- Corregida configuracion Playwright: `testDir` ahora apunta a `./tests`, evitando que el runner escanee todo el repo y arboles pesados.
- Corregida interaccion de tabs en `/features`: `FeaturesSection` queda controlado en cliente y el smoke publico espera hidratacion antes de interactuar. Test aislado de tabs pasa.
- Estado E2E completo tras segunda pasada Chromium: roles PASS 3/3, a11y PASS 4/4, public smoke PASS 6/6 dentro del rerun amplio; suite principal `tests/e2e-zaltyko-full.spec.ts` queda con 1 fallo persistente en "critical academy pages render without route-level errors" por timeout del dev server al recorrer muchas rutas, y 2 flakies que pasaron en retry.

## 2026-07-09 - Correccion de preferencias y smoke por roles

- Alineado `src/db/schema/user-preferences.ts` con Supabase: `user_preferences` usa `user_id` como clave primaria y no expone columna `id`.
- Actualizado onboarding para consultar y actualizar preferencias por `user_id`.
- Ajustado el smoke de Coach para tolerar cancelaciones de navegacion propias del dev server y verificar la pantalla final.
- Validacion: smoke de Coach PASS 1/1; smoke combinado de Super Admin, Owner y Coach PASS 10/10 en el rerun completo.

## 2026-07-09 - Trazabilidad Super Admin aplicada

- Aplicada en Supabase la migracion `20260709000000_allow_global_audit_logs.sql`.
- La migracion alinea `audit_logs` con el schema: agrega de forma no destructiva los campos descriptivos faltantes y conserva los datos existentes.
- Ajustadas las policies para que las entradas globales sin academia no queden disponibles para usuarios normales de una academia.
- Verificada una insercion completa de auditoria en una transaccion revertida: no se conservaron datos de prueba.

## 2026-07-09 - Aislamiento de audit logs endurecido

- Aplicada la migracion `20260709010000_scope_audit_logs_to_super_admin.sql`.
- Las policies de `audit_logs` ahora reservan el bypass global para `is_super_admin()`; una cuenta normal solo puede acceder a filas de su tenant.
- Pruebas RLS transaccionales: un owner no pudo leer un log global, un Super Admin sí pudo, y el owner pudo crear y leer un log de su propio tenant. No quedo ningun dato de prueba.

## 2026-07-09 - Acciones sensibles y E2E ampliado

- Los diálogos de Super Admin para cambiar rol, suspender/reactivar o borrar usuarios/academias exigen un motivo de al menos 5 caracteres.
- Las APIs de Super Admin rechazan esas acciones sin motivo y lo almacenan en `audit_logs`; las fichas de detalle también solicitan el motivo si cambia el acceso.
- E2E por roles: PASS 10/10. Smoke público aislado: PASS 6/6. Accesibilidad aislada: PASS 4/4.
- La pasada combinada de 30 pruebas mostró inestabilidad específica de `next dev` durante recompilación intensa; los fallos públicos no se reprodujeron al ejecutar la suite aislada. Pendiente estabilizar el servidor de pruebas antes de usar la combinación como gate único.

## 2026-07-10 - Gate E2E completo en servidor de produccion

- Generado un build limpio y regeneradas sesiones de producción para owner, coach y super-admin; autenticacion PASS 3/3.
- Ejecutada en Chromium con un worker la pasada conjunta de flujos completos, páginas públicas, accesibilidad y roles: PASS 40/40, sin contextos de error en `test-results`.
- Estabilizado el guardado de sesiones esperando la hidratacion y comprobando que email y contraseña sigan presentes antes de enviar el formulario.
- Corregidos los detalles demo públicos de marketplace y empleo para resolver sus datos de forma directa y construir enlaces con el origen real de la petición.
- Relajada la validación de identificadores de atletas al formato UUID que admite PostgreSQL y estabilizada la navegación E2E esperando la hidratación antes del clic.
- Validaciones adicionales: build, typecheck, chequeo de migraciones y `audit-hardening` PASS 12/12.
- Quedan documentados como deuda no bloqueante los avisos repetidos de métricas GR no disponibles y el intento de formatear `Sin días asignados` como fecha.

## 2026-07-12 - Nomenclatura federativa por país/disciplina: diagnóstico y arranque de Fase 0

- **Origen**: el usuario pidió que el panel de cada academia use la nomenclatura real de su país y disciplina (RFEG en España, FMG en México, etc.), en vez de un vocabulario genérico. Análisis confirmó que ya existe una arquitectura completa para esto en `src/db/schema/sport-config.ts` (`countries` → `sportDisciplines` → `sportBranches` → `sportLocaleConfigs` → `terminologyDictionary`/`apparatus`/`programs`/`levels`/`categories`/`competitionTypes`, más `academySportConfigs` para activación por academia) — no se rediseñó el modelo de datos, solo se auditó su contenido y conexión.
- **Hallazgos de diagnóstico** (ver plan en `~/.claude/plans/lo-que-me-interesa-jolly-creek.md` del usuario para el detalle completo):
  - `SPORT_CONFIG_SEEDS` en `src/lib/sport-config/catalog.ts` solo tiene 3 entradas, todas de España (`ES:artistic_female`, `ES:artistic_male`, `ES:rhythmic`), y modela la Vía Olímpica de GAF con 3-4 niveles cuando la normativa real vigente tiene 10.
  - Bug de robustez confirmado: `getSportConfigSeedByVariant()` (catalog.ts) devuelve `null` sin aviso cuando el `countryCode` de una academia no tiene seed sembrado; `activateAcademySportConfig()` (seed.ts) propaga ese `null` sin error, y tanto el onboarding (`src/app/api/onboarding/owner/route.ts`) como el endpoint de settings siguen adelante sin avisar al dueño. Cualquier academia fuera de España se queda silenciosamente sin nomenclatura especializada.
  - `getSpecializedNavigationLabel()` (`src/lib/specialization/registry.ts`) solo traduce 2 de ~14 claves del menú lateral; el resto usa labels hardcodeados pese a que el sidebar ya recibe el contexto de especialización.
  - Inconsistencia real entre `DEFAULT_TERMINOLOGY` (`sport-config/terminology.ts`) y el default usado por `specialization/registry.ts` — no son solo shapes distintos, tienen valores distintos para el mismo concepto (ej. "Atleta" vs "Gimnasta").
  - `src/types/athlete-edit.ts` mantiene un catálogo legacy paralelo (`CATEGORY_OPTIONS`, `LEVEL_OPTIONS`) usado como fallback en `AthleteLevelForm.tsx`, compitiendo con el sistema dinámico.
- **Fase 0 (investigar y corregir la normativa de España) — INICIADA, NO CERRADA**: se intentó extraer los PDFs oficiales de normativa técnica RFEG 2025/2026 (GR y programa técnico por edades) — ambos fetches devolvieron contenido vacío, no se pudo leer el PDF directamente. El research con fuentes secundarias (blogs especializados, federaciones autonómicas) confirmó con solidez razonable que la Vía Olímpica de GAF tiene 10 niveles ligados a la edad, pero encontró **contradicciones reales sin resolver** en el número de niveles del Programa Base de GAF (una fuente dice 2, otra dice 10, otra sugiere al menos 3) y en las categorías de edad exactas de gimnasia rítmica (3 listados distintos entre fuentes). Documentado completo con cada fuente y contradicción en `vault/07-Auditorias-y-Riesgos/Normativa RFEG 2025-2026 - borrador.md`.
- **Decisión de riesgo tomada**: NO se modificó `src/lib/sport-config/catalog.ts` con estos datos contradictorios. El riesgo de que un dueño de academia española vea niveles/categorías incorrectos presentados como oficiales es mayor que el beneficio de corregir ahora con datos sin confirmar. Queda pendiente que un humano con conocimiento federativo real (o una herramienta de extracción de PDF distinta) confirme los puntos marcados como contradictorios antes de tocar el catálogo de producción.
- **Pivote de esta sesión**: dado el bloqueo de datos en Fase 0, se pasó a ejecutar la Fase 1 (arreglar el fallback silencioso para países sin seed), que no depende de resolver la normativa española y es trabajo de lógica/código verificable de forma independiente.
- **Fase 1 completada (mismo día)**: `getSportConfigSeedByVariant()` (`src/lib/sport-config/catalog.ts`) ya no devuelve `null` en silencio cuando el país de una academia no tiene seed sembrado — busca un fallback genérico explícito (nuevas entradas `GENERIC:artistic_female`/`GENERIC:artistic_male`/`GENERIC:rhythmic`/`GENERIC:general`, con `federation: ""` y solo aparatos estándar FIG, nunca una federación inventada) marcado con `isGenericFallback: true`. `activateAcademySportConfig()` (`seed.ts`) propaga ese flag y el `configVersion` real en su valor de retorno. `createAcademy()` (`academies.lib.ts`) y ambos endpoints que activan sport-config (`onboarding/owner/route.ts`, `academies/[academyId]/settings/route.ts`) dejaron de adivinar `federationConfigVersion`/`specializationStatus` con un ternario hardcodeado por país+variante; ahora leen el resultado real de la activación y marcan la academia como `specializationStatus: "generic_fallback"` (nuevo valor, añadido a `AcademySpecializationStatus` en `specialization/registry.ts`) en vez de `"configured"` cuando no hay catálogo real para su país. El onboarding también expone `sportConfigFallback` en la respuesta de la API para que el frontend pueda mostrar un aviso (el aviso de UI en sí queda para la Fase 2, no se tocó ningún componente visual en esta sesión).
- **Validado**: `pnpm typecheck` limpio, `pnpm lint` limpio. Tests ejecutados: `academy-specialization.test.ts` (9), `api-academy-settings-sport-config.test.ts` (4), `api-billing-sport-filters.test.ts` (2), `api-charges-sport-config.test.ts` (2), `api-financial-reports-sport-config.test.ts` (2), `sport-config-catalog.test.ts` (8, incluye 3 casos nuevos para el fallback genérico) — 27/27 PASS. `tests/api-academies.test.ts` está excluido de la config de vitest (requiere entorno aparte), no se corrió. No se corrió `check:migrations` porque no hay cambios de schema/migraciones en este trabajo (solo TS de aplicación).
- **No ejecutado / pendiente**: no se corrió ningún seed contra la base de datos real ni Supabase — los cambios son de código de aplicación (catálogo en memoria + lógica de fallback); las entradas `GENERIC:*` se insertarán en `sport_locale_configs`/`terminology_dictionary`/etc. la próxima vez que `seedSportConfigurations()` corra en cualquier entorno (se dispara automáticamente al llamar `activateAcademySportConfig`, no requiere paso manual aparte). No se tocó ninguna migración SQL.
- Vault: actualizadas `Normativa RFEG 2025-2026 - borrador.md` (nueva), `Backlog priorizado.md` (fila 3.9 nueva + re-encuadre de 3.7), `Changelog interno.md` (esta entrada).

## 2026-07-12 (tarde) - Fase 0 cerrada con datos oficiales confirmados + hallazgo de tercer sistema paralelo

- **El usuario proporcionó los 3 PDFs oficiales de la RFEG** (descargados desde su propio navegador, sin el CAPTCHA que bloqueaba el acceso automatizado): `PROGRAMA-TECNICO_GAF_2026.pdf`, `PROGRAMA-TECNICO-NIVELES_GAM_2026.pdf`, `NORMATIVA-TECNICA-GR-2026.pdf` (los 3 "Aprobado JD 26 septiembre 2025"). Se leyeron completos con la herramienta de lectura de PDF (requirió `brew install poppler` para renderizar páginas, no estaba instalado).
- **`src/lib/sport-config/catalog.ts` actualizado con datos confirmados, ya no estimados**:
  - GAF: Programa Base = **10 niveles** (Base 1-10, no 3-4 como antes) y Vía Olímpica = 10 niveles con nombre/edad exactos (VO1 Pre-Benjamín ≤8 años ... VO10 Sénior Élite 16+). El orden Sénior(VO8) antes de Júnior(VO9) es real, no error.
  - GAM: Programa Base = **5 niveles** (Base 1-5) con edades propias — confirmado que GAM NO comparte estructura con GAF (antes ambos usaban las mismas constantes `ES_ARTISTIC_LEVELS`/`ES_AGE_CATEGORIES`, error real corregido). Vía Olímpica GAM queda sin confirmar (el PDF proporcionado solo cubre Base).
  - GR: categorías individuales del Campeonato de España reemplazadas por las reales (Benjamín 2017-18, Alevín 2015-16, Infantil 2013-14, Júnior 2011-12, Sénior 2010-, 1ª Categoría, Júnior/Sénior Honor, Máster). El programa de niveles Base de GR queda sin confirmar (documento leído es de competición individual, no de Base).
  - Se separaron las constantes compartidas (`ES_AGE_CATEGORIES`/`ES_ARTISTIC_PROGRAMS`/`ES_ARTISTIC_LEVELS`) en `GAF_*`, `GAM_*` y `GR_AGE_CATEGORIES` propias — ya no hay una sola lista genérica reutilizada entre las 3 configuraciones de España.
  - Todo lo no confirmado queda comentado inline en el código citando la fuente exacta y qué falta, en vez de inventarse.
- **Tests corregidos por la actualización de datos** (comportamiento correcto, no regresión): `tests/lib/sport-config-catalog.test.ts` esperaba `programs: ["recreativo","base","via_olimpica"]` para GAF — "recreativo" no existe en la normativa real, se quitó del assert. `tests/api-academy-settings-sport-config.test.ts` usaba el código `"recreativo"` como programa-no-usado-para-forzar-conflicto; se cambió a `"via_olimpica"` (sigue siendo un código real y sigue siendo distinto del que está en uso, mismo efecto de test). 27/27 tests PASS tras el fix, `pnpm typecheck`/`pnpm lint` limpios.
- **Hallazgo nuevo, no anticipado por el plan original**: existe un **tercer sistema paralelo y activo** para categorías/niveles de España, independiente de `sport-config`: `src/db/schema/templates/*` + `src/db/seeds/templates/espana-ga.ts`/`espana-gr.ts` (sembrado manual vía `pnpm db:seed` → `scripts/seed.ts`), consumido en vivo por `src/lib/athletes/age-category.ts` → `src/app/api/athletes/route.ts`. Ese seed está comentado en el propio código como "normativa RFEG 2022-2024" y asume (incorrectamente, según los PDFs de hoy) que GAF y GR comparten las mismas categorías de edad. Documentado en detalle en `Normativa RFEG 2025-2026 - borrador.md`. **No se tocó** — es alcance de arquitectura para decidir antes de la Fase 2 (cuál de los 3 sistemas — `sport-config`, `templates`, o las constantes hardcodeadas de `athlete-edit.ts`/`GymMetricsWidget.tsx` — es la fuente única de verdad a futuro).
- **No ejecutado / pendiente**: no se corrió ningún seed contra DB real (ni `seedSportConfigurations()` ni `pnpm db:seed`). Sigue pendiente confirmar el programa Base de GR (Base 1-N, si existe) contra fuente primaria.
- Vault: actualizada `Normativa RFEG 2025-2026 - borrador.md` (sección de confirmación + hallazgo del tercer sistema), `Changelog interno.md` (esta entrada). Backlog: fila 3.9 actualizada con el estado de cierre de Fase 0.

## 2026-07-12 (noche) - Vía Olímpica GAM confirmada, Fase 0 prácticamente cerrada

- El usuario compartió una carpeta adicional (`documentos normativos por pais/España/`) con 6 PDFs oficiales más de la RFEG 2026, incluyendo `NORMATIVA-TECNICA-GENERAL_GAM_2026.pdf` — el documento que faltaba para confirmar la Vía Olímpica de GAM (el PDF leído antes solo cubría el programa Base).
- **GAM Vía Olímpica confirmada**: 8 categorías (Benjamín 7-9 años, Alevín ≤11, Infantil ≤13, Cadete ≤15, Juvenil ≤17, Sénior 16+, Júnior 15-18, Sénior Élite 18+) — estructura distinta a las 10 categorías de GAF (GAM tiene "Cadete", GAF no; GAF tiene variantes "Pre-", GAM no). Aplicado a `src/lib/sport-config/catalog.ts` (`GAM_AGE_CATEGORIES` ahora tiene 8 entradas reales en vez de las 5 categorías Base que tenía provisionalmente; `GAM_ARTISTIC_PROGRAMS`/`GAM_ARTISTIC_LEVELS` ahora incluyen tanto Base (5) como Vía Olímpica (8), igual que GAF).
- **Cross-check de GAF**: `NORMATIVA-TECNICA_GAF_2026.pdf` (documento distinto al ya leído) repite la misma tabla de Vía Olímpica de GAF con edades idénticas — confirmación cruzada entre 2 fuentes oficiales independientes, máxima confianza para ese dato.
- **Test nuevo añadido**: `tests/lib/sport-config-catalog.test.ts` — "reflects the real RFEG 2026 level/category structure per branch", verifica los conteos exactos (GAF 10+10, GAM 5+8, GR 9 categorías) y que GAF/GAM nunca compartan la misma lista de niveles. 9/9 tests del archivo PASS, `pnpm typecheck` limpio.
- **Sigue pendiente** (no crítico, alcance menor): el programa/niveles Base de GR (el documento `NORMATIVA-TECNICA-GR-2026.pdf` cubre competición individual, no el nivel Base) — hay un PDF "Listado ascensos Nivel Base" sin leer. La modelación de "aparatos distintos por categoría" en GR (Benjamín solo 2 aparatos, Sénior 3, 1ª Categoría los 4) sigue como simplificación conocida no corregida (requiere evaluar cambio de schema).
- No se leyeron los PDFs de Liga Iberdrola (GAF/GR) ni el Reglamento General de Competiciones de esta carpeta — son normativa de competición/liga de clubes, no afectan nomenclatura de niveles/categorías, quedan disponibles para cuando se aborde esa parte del producto (si aplica).
- Vault: actualizada `Normativa RFEG 2025-2026 - borrador.md` (GAM ya CONFIRMADO, cross-check GAF), `Changelog interno.md` (esta entrada). Backlog: no requiere cambio adicional a la fila 3.9 (el estado ya reflejaba "GAF/GAM/GR" en progreso con detalle).

## 2026-07-12 (noche) - Eliminado el cálculo muerto de `ageCategory`/`templateId` en creación de atletas

- **Revisión del tercer sistema paralelo** (`templates`/`espana-ga.ts`/`espana-gr.ts`) encontrado antes: se confirmó que `programCode`/`levelCode`/`categoryCode` (los campos reales, validados contra `academySportConfigs` via `isProgramCodeAllowed`/etc. en `src/app/api/athletes/route.ts`) YA son la fuente de verdad funcional para nivel/categoría de un atleta — el formulario `EditAthleteDialog.tsx`/`AthleteLevelForm.tsx` ya saca sus opciones dinámicamente de `sport-config`, así que las correcciones de datos de hoy (GAF/GAM/GR reales) ya se reflejan ahí sin tocar nada más.
- **El campo `ageCategory`/`templateId` (calculado desde `templates` por fecha de nacimiento) resultó ser código muerto en la práctica**: se rastreó cada referencia en el código — se escribe al crear un atleta, se transporta en tipos y selects de `coach/page.tsx` y `/api/coaches/[coachId]/athletes`, pero **nunca se renderiza en ningún JSX real**. El único componente que lo mostraba, `AthleteProfileHeader.tsx`, no está importado por ningún otro archivo del proyecto — está huérfano, inalcanzable.
- **Fix aplicado**: `src/app/api/athletes/route.ts` ya no llama a `calculateAgeCategoryForAthlete()` ni hace el `SELECT` extra a `academies` que solo existía para alimentarlo, ni escribe `templateId`/`ageCategory` al crear un atleta (import de `calculateAgeCategoryForAthlete` eliminado). Esto ahorra 1-2 queries por creación de atleta y deja de escribir un dato calculado con normativa desactualizada (2022-2024) que además asumía incorrectamente que GAF y GR comparten categorías de edad.
- **No se tocó** (deliberado, fuera de alcance de este fix puntual): el schema `templates`/`templateAgeCategories`/etc., los seeds `espana-ga.ts`/`espana-gr.ts`/`espana-ga-elements.ts`/`espana-gr-elements.ts` (podrían sembrar otras cosas no relacionadas con `ageCategory`, no se auditaron a fondo), ni el componente huérfano `AthleteProfileHeader.tsx`. Quedan como deuda de limpieza menor, no urgente — no afectan a ningún usuario real hoy.
- **Validado**: `pnpm typecheck` y `pnpm lint` limpios tras el cambio. `tests/api-athletes.test.ts` está excluido de la config de vitest (requiere entorno con DB real, igual que `api-athletes.test.ts`/`api-academies.test.ts` ya documentado antes) — no se pudo correr en este entorno; se verificó manualmente que no queda ninguna referencia a `ageCategory`/`templateId` en el archivo modificado.
- Vault: `Changelog interno.md` (esta entrada). No requiere cambio en Backlog priorizado (no era un ítem del backlog, fue un fix puntual dentro de la revisión de la fila 3.9).

## 2026-07-12 (noche) - Arranca Fase 2: unificación de terminología + sidebar completo

- **Fase 2.1 (unificación)**: `DEFAULT_TERMINOLOGY` (`src/lib/sport-config/terminology.ts`) ya no es un objeto propio con valores distintos a `BASE_TERMINOLOGY` (`sport-config/catalog.ts`, ahora exportado) — antes divergían en el mismo concepto (ej. "Atleta" vs "Gimnasta"), lo que hacía que el fallback "sin config de deporte" (usado en `GenerateChargesDialog.tsx`, `ScholarshipForm.tsx`, `ScholarshipList.tsx` cuando no reciben `terminology` por prop) mostrara un vocabulario distinto al de cualquier academia real ya configurada. Ahora `DEFAULT_TERMINOLOGY = BASE_TERMINOLOGY` (una sola fuente). Test actualizado en `tests/lib/sport-config-terminology.test.ts` para reflejar "Gimnasta" como el fallback correcto (coherente con el 100% de las configs reales de España).
- **Fase 2.2 (sidebar)**: `getSpecializedNavigationLabel()` (`src/lib/specialization/registry.ts`) ahora traduce también `coaches` y `groups` (antes solo `athletes`/`classes`), usando un helper nuevo `pluralizeFirstWord()` que pluraliza solo la primera palabra de la etiqueta (evita el bug que habría introducido un "+s" ciego sobre labels compuestas como "Grupo de entrenamiento" → habría dado "Grupo de entrenamientos" en vez de "Grupos de entrenamiento"). El resto de claves de navegación (events, assessments, messages, notifications, announcements, reports, billing, settings, dashboard, my-dashboard) se dejaron **deliberadamente sin traducir**: son conceptos de producto genéricos sin campo equivalente en `SpecializedLabels`, y forzar una traducción (ej. "Eventos" → "Competiciones") sería incorrecto porque esa sección ya mezcla competiciones con actividad no competitiva a propósito. No es una laguna pendiente, es una decisión de alcance documentada en el propio código.
- **Tests añadidos**: `tests/academy-specialization.test.ts` — 2 casos nuevos (rítmica: "Entrenadoras"/"Grupos de entrenamiento", pluralización con vocal final; artística masculina: "Entrenadores"/"Grupos", pluralización con consonante final) más una aserción de que las claves genéricas (billing/settings) mantienen su label por defecto.
- **Validado**: `pnpm typecheck`/`pnpm lint` limpios. 33/33 tests PASS (7 archivos: sport-config-catalog, sport-config-terminology, academy-specialization, api-academy-settings-sport-config, api-billing-sport-filters, api-charges-sport-config, api-financial-reports-sport-config).
- **Sigue pendiente de la Fase 2** (próxima sesión): hook único `use-sport-terminology.ts`, auditoría del dashboard (ya parcialmente conectado), y los módulos con mayor densidad de texto hardcodeado (athletes/classes/events/groups/assessments — incluye finalmente eliminar el catálogo legacy paralelo de `athlete-edit.ts` `CATEGORY_OPTIONS`/`LEVEL_OPTIONS`, que hoy casi nunca se activa pero sigue existiendo).
- Vault: `Changelog interno.md` (esta entrada). Backlog: no requiere cambio (la fila 3.9 ya cubre "Fase 2 pendiente" en términos generales).

## 2026-07-12 - Sprint 0 de producto real: seguridad, contratos y release gate

- Corregido `middleware.ts`: el rate limit ya no devuelve 429 incondicional; propaga headers cuando permite, bloquea solo al superar limite y localiza unicamente rutas que tienen handler localizado. `/pricing`, `/app/*` y otras rutas reales dejan de redirigirse a variantes inexistentes.
- Cerrado aislamiento tenant: `admin` global ya no es cross-tenant; `academyId` se resuelve mediante `academies.owner_id` o `memberships`, con 403 explicito en `withTenant` y `withBearerTenant` cuando no existe acceso.
- PWA endurecida: SW v2 no cachea APIs ni HTML privado, purga caches antiguos y elimina background sync; la cola de mutaciones offline queda deshabilitada hasta disenar idempotencia/conflictos. Manifest deja de anunciar shortcuts legacy y `/api/share` inexistente.
- Catalogo v3.0 unificado con la decision activa: `free`=Free, `pro`=Starter 19/75, `premium`=Growth 49/200; Network 99 es `network` comercial, multi-sede acompanada y sin checkout. Limites, seed, pricing, billing y upsells consumen el mismo contrato.
- Navegacion y layout consumen membership efectiva: owner/coach/viewer ya no heredan privilegios de un rol global ajeno a la academia; familias conservan solo `my-dashboard`, mensajes y avisos.
- Auditorias: 2 stubs raiz clasificados como deprecated; auditoria API estricta queda en 0 mutaciones desconocidas. RLS valida duplicados por fuente (snapshot e historial no se confunden). Migraciones valida 3 Drizzle + 26 Supabase.
- `verify:production` reemplazado por gate real: preflight, 272 APIs, RLS, migraciones, typecheck, lint, Vitest y build. `.env.example` documenta secretos JWT/Auth internos y KV necesarios sin incluir valores reales.
- Copy publico corregido: sin “100% seguro”, RGPD garantizado, puesta en marcha en 2h ni descuento anual calculado. Free lleva a registro; planes pagados a demo; Network a onboarding.
- Hallazgo E2E y fix adicional: antes de hidratar React, contacto podia caer en submit GET y poner datos personales en URL. El boton espera hidratacion; E2E publico Chromium 6/6.
- Validacion final: `verify:production` PASS; 48 archivos/407 tests PASS; build PASS 213 paginas; E2E publico Chromium 6/6. Warnings residuales: opciones Sentry deprecadas, dependencia dinamica swagger-jsdoc y dashboard 621 kB First Load JS.
- No se aplicaron migraciones ni seeds a Supabase. No se hizo deploy, commit ni push.
- Trabajo paralelo de nomenclatura deportiva preservado; el cambio de `src/app/api/athletes/route.ts` se integro en una seccion distinta sin revertir la eliminacion de `ageCategory`/`templateId`.
- Vault: actualizadas `Estado actual de Zaltyko`, `Arquitectura`, `Runbook migraciones`, `Pricing`, `Mensajes aprobados`, `Registro de riesgos`, `Backlog priorizado`, `Decisiones` y `Changelog interno`.

## 2026-07-12 - Cierre federativo antes de Fase 1: RFEG v2 sincronizado en Supabase

- Se releyo el trabajo paralelo de nomenclatura y se contrastaron directamente los seis PDF
  oficiales locales con `pdftotext`: GAF VO 1-10, GAM 8 categorias de campeonato y las nueve
  categorias individuales GR coinciden con `catalog.ts`. Base GR sigue explicitamente sin
  confirmar; no se inventaron datos.
- Se detecto que el seed idempotente hacia upsert pero dejaba activos los codigos retirados.
  `seedSportConfigurations()` ahora desactiva programas, niveles, categorias y tipos de
  competicion ausentes del catalogo vigente, sin borrar historia.
- Los catalogos espanoles pasan a `rfeg-2026-v2`. Se anadio
  `pnpm db:sync-sport-configs`, con dry-run por defecto, bloqueo si una academia conserva
  selecciones retiradas y `--apply` explicito.
- Supabase verificado en PostgreSQL 17.6. Dry-run: una academia, seleccion `via_olimpica`
  valida y cero mapeos manuales. Aplicacion: siete configuraciones sincronizadas (tres RFEG y
  cuatro fallbacks genericos), metadata de una academia actualizada. Segundo dry-run: cero
  diferencias. No hubo migracion de schema ni se ejecuto el seed global.
- Los documentos oficiales quedan preservados bajo `documentos normativos por pais/España/`;
  artefactos locales de herramientas, capturas y prompts permanecen fuera de Git.
- Vault: actualizados `Runbook migraciones`, `Backlog priorizado`, `Changelog interno` y la
  nota normativa.

## 2026-07-12 (noche) - Fase 2.3: hook único `use-sport-terminology`

- `AcademySpecializationContext`/`SpecializationRegistryEntry` (`src/lib/specialization/registry.ts`) ganan un campo `terminology: SportTerminology`, derivado del mismo seed (`config.terminology` en el REGISTRY, `BASE_TERMINOLOGY` en `DEFAULT_ENTRY` — reutiliza la unificación de la Fase 2.1, no un tercer valor). Antes el contexto de especialización solo exponía `labels` (frases compuestas); ahora también expone el diccionario simple palabra-por-palabra sin necesitar un fetch adicional.
- Nuevo `src/hooks/use-sport-terminology.ts`: hook por defecto para componentes nuevos — `const t = useSportTerminology()` da acceso a `t.athlete`, `t.coach`, `t.labels.dashboardHeadline`, etc., derivado de `useAcademyContext().specialization`. Documentado explícitamente que NO refleja `terminologyOverrides` por academia (eso lo siguen resolviendo los componentes que ya reciben `sportConfigs` por props, como `EditAthleteDialog.tsx`, vía `getTerminology()` directo) — este hook es el default de disciplina/país, para componentes que hoy no tienen esa data ya resuelta.
- **Validado**: el cambio se mantuvo separado del trabajo concurrente de billing/trial y no alteró sus archivos. La validación integrada posterior deja `pnpm typecheck` limpio. 27/27 tests relevantes PASS en la comprobación original.
- Vault: `Changelog interno.md` (esta entrada).

## 2026-07-12 - Fase 1: trial, Stripe y permisos listos para promoción

- Trial Starter de 7 días sin tarjeta persistido por academia, con una activación cada 365 días, expiración a Free, conversión al contratar y avisos del día 5/fin. Nuevo endpoint owner-only y cron diario; la lectura lazy también corrige expiraciones.
- Checkout, portal, estado, historial y sync de suscripción quedan limitados al owner/super-admin. Checkout usa metadata explícita de academia e idempotencia; bloquea una segunda suscripción activa. Los endpoints manuales legacy responden 410.
- Webhooks Stripe ahora registran cada evento antes de procesar, permiten reintento tras error/lease vencido y rechazan snapshots anteriores. La suscripción se actualiza bajo lock transaccional; contexto e invoices exigen academia+tenant coherentes.
- CRUD real de roles personalizados: crear/editar/borrar, herencia sin ciclos, asignar/quitar miembros y permisos por módulo. La matriz de rutas críticas se integra en `withTenant`/`withBearerTenant`; billing de suscripción permanece owner-only.
- Supabase: aplicada y verificada `20260712230000_phase1_trial_and_billing_events.sql`; 27 migraciones Supabase, RLS 64/64. No se ejecutó el seed global. `db:generate` se canceló sin escribir por drift histórico no relacionado, registrado en backlog.
- Planes DB sincronizados sin diferencias; productos/prices Stripe live conservan 19/49 EUR y usan nombres/metadata Starter/Growth. Secrets de cron/webhook rotados en Vercel sin exponer valores; endpoint anterior de Stripe se conserva solo hasta el smoke de producción.
- Gate final local verde: auditoría estricta 275 APIs y 0 mutaciones riesgosas, RLS 64/64, 3+27 migraciones, typecheck, lint, 49 archivos/413 tests y build de 214 páginas. El gate limita Vitest a 4 workers para evitar timeouts falsos por saturación; conserva timeouts por test.
- Cambios paralelos de nomenclatura preservados: hook único y KPI sport-aware permanecen intactos y se validarán/commitearán por separado.

## 2026-07-13 - Fase 2: auditoría del dashboard, primer fix (`KPISection.tsx`)

- Auditoría acotada de `src/components/dashboard/` (grep de "Atleta"/"Gimnasta" hardcodeado en los ~35 archivos del directorio): 3 hallazgos.
  - `KPISection.tsx` (tarjetas KPI del dashboard) — **arreglado**: títulos "Atletas"/"Entrenadores" hardcodeados pese a que el componente ya recibía `labels` (`SpecializedLabels` completo) como prop desde `DashboardPage.tsx` sin usarlos para esas dos tarjetas. Además, la tarjeta de grupos ya usaba `labels.groupLabel` pero con el mismo bug de pluralización ciega (`${label}s`) que ya se había corregido en el sidebar — para Rítmica habría mostrado "Grupo de entrenamientos" en vez de "Grupos de entrenamiento". Las 3 tarjetas ahora usan `labels.athletesPlural` y `pluralizeFirstWord(labels.coachLabel / labels.groupLabel)`.
  - `pluralizeFirstWord()` (antes privada en `specialization/registry.ts`, usada solo por el sidebar) pasa a exportarse para reutilizarse aquí — evita reimplementar la misma lógica de pluralización en cada componente.
  - `AdvancedMetrics.tsx` ("Atletas activos" hardcodeado) — **no tocado**: el componente está completamente huérfano, no lo importa ningún otro archivo del proyecto. Mismo patrón que `AthleteProfileHeader.tsx` encontrado antes. Deuda de limpieza menor, no urgente.
  - `QuickPaymentModal.tsx` (`charge.athleteName || "Atleta"`) — **no tocado a propósito**: es un fallback de bajísima visibilidad para cuando falta el nombre del atleta en un cargo, no vale la pena enhebrar `labels` a través del modal para ese caso extremo.
- **Validado**: `pnpm typecheck`/`pnpm lint` limpios. No existe harness de test de componentes React en este proyecto (solo tests de API/lib) — no se añadió test dedicado a `KPISection.tsx`; la corrección se apoya en `pluralizeFirstWord()`, que ya tiene cobertura en `tests/academy-specialization.test.ts`.
- **Alcance restante de la auditoría de dashboard**: no se revisaron a fondo los ~30 archivos restantes del directorio (solo se grepeó por el patrón "Atleta"/"Gimnasta" literal, que no detecta términos ya abstraídos incorrectamente de otras formas, ej. "Grupo"/"Equipo" sueltos). Queda pendiente una pasada más completa si se decide seguir invirtiendo aquí.
- Vault: `Changelog interno.md` (esta entrada).

## 2026-07-13 - Fase 2: módulos athletes/classes/events/groups/assessments conectados a terminología

- Auditoría de los 27 archivos de `src/components/{athletes,classes,events,groups,assessments}/` con menciones de "atleta"/"entrenador"/"gimnasta" (grep case-insensitive; una primera pasada con `\b` dio falsos negativos en plurales como "entrenadores" — corregido a mitad de la auditoría, ver más abajo).
- **Módulo `groups` completado al 100%** (5/5 archivos): `GroupView.tsx`, `UpdateGroupCoachesDialog.tsx`, `UpdateGroupMembersDialog.tsx`, `EditGroupDialog.tsx`, `GroupsDashboard.tsx`. `pluralizeFirstWord()` (creado para el sidebar en la sesión anterior) se reutiliza aquí en vez de reimplementar sufijos ad-hoc.
- **Módulo `athletes`**: 8 archivos arreglados (`DocumentUploadModal.tsx`, `CreateExtraClassDialog.tsx`, `AthletesKanbanView.tsx`, `AthleteAccountSection.tsx`, `AthleteClassesSection.tsx`, `AthleteBaseClassesSection.tsx`, `AthleteExtraClassesSection.tsx`, `guardians/GuardiansSection.tsx`, `AthletesTableSections.tsx` — este último ya recibía `terms` como prop, solo faltaba aplicarlo en 2 sitios).
- **Módulo `events`**: `InvitationCard.tsx` arreglado (distingue invitación de atleta vs guardián).
- **Módulo `assessments`**: `AthleteEvaluationsTab.tsx`, `AssessmentTypeSelector.tsx` (constante de nivel de módulo convertida en función que recibe el término), `AssessmentPDFExport.tsx`.
- **Patrón recurrente encontrado**: varios componentes (`AthleteBasicInfoForm.tsx`, `AthleteHistoryView.tsx`, `AddAthleteToClassDialog.tsx`) ya tenían un prop `athleteLabel`/`athletesLabel` con default hardcodeado ("atleta") — pero el caller real (`EditAthleteDialog.tsx`, `ClassDetailView.tsx`, páginas de historial) YA pasa el valor correcto de `terms`/`specialization`. Estos no se tocaron, el default nunca se ve en producción real.
- **Código muerto encontrado, no tocado** (mismo patrón que `AthleteProfileHeader.tsx` de sesiones anteriores): `EnrollmentManager.tsx` y `EventRegistrationsPanel.tsx` no los importa ningún otro archivo del proyecto — huérfanos, inalcanzables.
- **Decisión deliberada de no tocar** `AssessmentsClientView.tsx` y `ImportExportPanel.tsx`: ambos pueden renderizar sin `academyId`/fuera del árbol de `AcademyProvider` (vistas legacy multi-academia / herramienta a nivel de tenant) — forzar `useAcademyContext()` ahí rompería esos casos en vez de arreglarlos.
- **Corrección de metodología a mitad de la auditoría**: la primera verificación de "archivo limpio" usaba `grep -i "entrenador\b"`, cuyo `\b` no matchea el plural "entrenadores" (no hay límite de palabra entre "r" y "e"). Esto dejó pasar 3 menciones sin arreglar en `GroupView.tsx` que se creían ya cerradas; se detectaron y corrigieron en una segunda pasada sin `\b`. Repetir esta verificación sin `\b` si se continúa esta auditoría en otros módulos.
- **Validado**: `pnpm typecheck`/`pnpm lint` limpios. 33/33 tests relevantes PASS (sport-config-catalog, sport-config-terminology, academy-specialization, api-academy-settings-sport-config, api-billing-sport-filters, api-charges-sport-config, api-financial-reports-sport-config).
- **Sigue pendiente**: `classes` module solo tiene código muerto/ya-resuelto (nada más que hacer ahí salvo que aparezca un componente nuevo); no se auditó el resto del árbol de `src/components/` fuera de estos 5 directorios y `dashboard/` (billing, reports, coaches — menor prioridad según el plan original).
- Vault: `Changelog interno.md` (esta entrada).

## 2026-07-13 - Fase 2 cerrada: billing/reports/coaches + hallazgo de copy de pricing inconsistente

- Auditoría de los 16 archivos restantes en `src/components/{billing,reports,coaches}/`.
- **Hallazgo real en `billing`, no solo cosmético**: el copy de límites de plan usaba "atletas" en 4 sitios (`PlanSelector.tsx`, `BillingSummary.tsx` x2, `DowngradeModal.tsx`, `PlanComparison.tsx`) mientras el resto del módulo (y el propio `Pricing.md`/`Decisiones.md`/`Mensajes aprobados.md` del vault) usa consistentemente **"gimnastas"** como término aprobado para los límites de plan ("Free hasta 30 gimnastas", decisión de negocio explícita, no un label de UI que deba variar por disciplina). Se corrigieron esos 4 sitios a "gimnastas" — **esto NO se conectó a `useAcademyContext()`**, es copy comercial fijo aprobado, a propósito distinto del resto de la Fase 2 (que sí usa terminología dinámica por disciplina/país). Ver `Security`/reglas del proyecto: no tocar pricing sin alinear con esos documentos — se verificó primero, no se asumió.
- **`reports`**: `ProgressReport.tsx` (ya tenía `specialization`, solo faltaba 1 mensaje de error), `FinancialReport.tsx`, `ChurnReport.tsx`, `ScheduledReports.tsx` (el label de tipo de informe "Entrenadores" ahora usa `pluralizeFirstWord(coachLabel)`). `CoachReport.tsx`: los nombres de archivo descargados (`reporte-entrenadores-*.pdf`) se dejaron sin tocar a propósito — es un slug técnico, no prosa, y el riesgo de romper el nombre de archivo con un término que tenga espacios/acentos no compensa el beneficio.
- **`coaches`**: `CertificationsSection.tsx`, `CoachNotesManager.tsx`, `NoteForm.tsx`, `CoachTodayView.tsx` conectados. `CoachAssignmentsPanel.tsx` confirmado huérfano (nadie lo importa) — mismo patrón que los demás componentes muertos encontrados en esta Fase 2, no tocado.
- **Con esto se completó el barrido de todo `src/components/` señalado por el plan original** (athletes, classes, events, groups, assessments, dashboard, billing, reports, coaches). No se auditaron otros directorios de `src/components/` fuera de estos 9 (ej. `super-admin/`, `provider/`, `public/`) — quedan fuera del alcance original de la Fase 2, que se centraba en el panel de la academia.
- **Validado**: `pnpm typecheck`/`pnpm lint` limpios. 33/33 tests relevantes PASS.
- **Fase 2 se da por cerrada** en su alcance original. Queda pendiente, fuera de esta fase: decidir qué hacer con el sistema paralelo `templates` (ver hallazgo de sesiones anteriores) y unificar `COUNTRY_NAME_BY_CODE`/`COUNTRY_CODE_BY_NAME` (`specialization/registry.ts`, hoy solo ES/MX/AR hardcodeados) con `countryRegions.ts` antes de agregar el primer país nuevo en la Fase 3.
- Vault: `Changelog interno.md` (esta entrada). Backlog: pendiente marcar fila 3.9 como Fase 2 completa (siguiente paso).

## 2026-07-13 - Fase 3 arrancada: unificación de mapas de país + investigación de México bloqueada por intranet

- **Prerequisito resuelto**: `COUNTRY_NAME_BY_CODE`/`COUNTRY_CODE_BY_NAME` (`src/lib/specialization/registry.ts`) ya no son una tercera lista paralela solo-ES/MX/AR — se derivan de `countryRegions.ts` (los ~20 países hispanohablantes que el resto del producto ya soporta en selects de país/región). `getCountryNameFromCode("DO")` antes devolvía literalmente `"DO"`, ahora devuelve `"República Dominicana"`. Tolerancia a texto con/sin acentos preservada (`stripDiacritics` genérico en vez de los 2 casos hardcodeados que había). Test nuevo en `academy-specialization.test.ts` cubre esto. `pnpm typecheck`/`pnpm lint` limpios, 11/11 tests del archivo PASS.
- **Documento nuevo**: `vault/00-Inicio/Patron para agregar pais federativo nuevo.md` — checklist repetible de 7 pasos derivado de la experiencia real cerrando España, para que agregar cualquier país futuro no dependa de releer todo el historial de Changelog.
- **Investigación de México (candidato siguiente, sin confirmar aún)**: confirmado que `fmgimnasia.org` es el sitio real de la Federación Mexicana de Gimnasia (verificado: clasificación a París 2024, estados afiliados, contacto `.org.mx`). **Confirmada en la práctica la trampa de dominio ya anticipada**: `fmgimnasia.com` es la Federación **Madrileña** de Gimnasia (España) — una búsqueda genérica devolvió sus PDFs "normativa FMG 2026" presentándolos como si fueran mexicanos.
- **Bloqueado**: la FMG no publica su normativa técnica (niveles/edades/categorías) en el sitio público — vive detrás de un intranet de afiliados (`intranet.fmgimnasia.org`, requiere login). A diferencia de la RFEG (normativa pública, solo bloqueada por CAPTCHA para descarga automatizada), aquí no hay ninguna versión pública accesible. No se intentó acceder sin credenciales.
- **No se tocó `catalog.ts`** — no hay ningún dato de México confirmado que agregar todavía. Se le preguntó al usuario cómo proceder (¿tiene contacto/documento de la FMG, o prefiere otro país como siguiente candidato?).
- Vault: `Patron para agregar pais federativo nuevo.md` (nuevo, con el hallazgo del intranet), `Changelog interno.md` (esta entrada).

## 2026-07-13 - Cierre productivo de Fase 1 y Fase 2 de roles/comunicación

- **Drift DB/ORM cerrado**: creada, inspeccionada, aplicada y verificada `20260713090000_reconcile_phase1_schema_drift.sql`; `push_tokens` queda materializada, las FKs de perfiles y los índices únicos coinciden con Drizzle. Inventario final: 113 tablas, 4 migraciones Drizzle + 28 Supabase y RLS 64/64. Se ejecutó rollback smoke y no se usó el seed global.
- **Stripe productivo**: rotación completada a un único endpoint activo; webhook sin firma sigue fallando cerrado. La migración de Fase 1 y los contratos de trial/billing/permisos quedan operativos.
- **Portal familiar limitado**: `my-dashboard` acota todas las lecturas por tenant, academia y relaciones autorizadas; corrige el join de coach y elimina enlaces a superficies administrativas o WhatsApp. Si no hay personas vinculadas, presenta un estado útil con acceso a mensajería interna.
- **Comunicación desde la clase**: nueva API `POST /api/messages/group-alert`, protegida con `withTenant`, Zod, scope de coach por clase y rate-limit 10/min. Solo notifica cuentas de familia/gimnasta vinculadas a inscritos; reutiliza una conversación contextual por sesión y no crea historial vacío cuando faltan destinatarios.
- **UI y preferencias**: `TodayQuickActions` quedó integrado en el dashboard de entrenador; mensajes aceptan contexto de sesión y muestran compositor accesible. Preferencias de notificación alineadas al envelope estándar, merge anidado correcto y etiquetas accesibles; avisos de grupo enlazan al historial interno. WhatsApp permanece oculto por feature flag.
- **Auditoría owner**: dashboard, mensajes y preferencias cargan con el flujo dev opt-in. Se corrigieron pluralización, terminología por deporte y sesiones sin fecha. El portal familiar redirige correctamente al owner; falta una sesión humana con credencial parent/athlete real vinculada.
- **Gate completo**: 276 APIs auditadas sin rutas riesgosas, TypeScript y lint limpios, 422/422 tests (51 archivos), build Next.js de 214 páginas. Persisten advertencias no bloqueantes ya registradas de Sentry y `swagger-jsdoc`.
- Vault: `Estado actual de Zaltyko`, `Plan operativo gimnasia`, `Runbook migraciones`, `Registro de riesgos`, `Backlog priorizado`, `Decisiones` y este changelog.

## 2026-07-13 - Cierre de dependencias y deployment definitivo de Fase 2

- El aviso de Dependabot de la rama por defecto se contrastó contra el lockfile actual. La auditoría inicial de esta rama mostró un moderado de esbuild y dos bajos de webpack en producción, además de Vitest/Vite críticos/altos en desarrollo.
- `drizzle-kit` pasó de dependencia runtime a desarrollo; se materializó webpack corregido y se actualizaron Vite a 6.4.3 y Vitest/coverage a 3.2.6. Drizzle CLI sigue operativo.
- Resultado final: `pnpm audit --prod` y `pnpm audit` completo con 0 vulnerabilidades; gate con 276 APIs, RLS 64/64, migraciones 4+28, 422/422 tests y build de 214 páginas.
- Deployment limpio `dpl_AYKBXmfi88CK2MeqWvZMqKjo3Bee` desde `47228ee5`, `READY` y aliasado a `zaltyko.com`. Smokes finales: pricing 200, privado 307, APIs privadas/cron 401 y webhook sin firma 400.

## 2026-07-13 - Fase 3 cerrada y desplegada: cockpit de clase de hoy

- **Una sola superficie de trabajo**: nueva ruta `/app/[academyId]/coach/today/[sessionId]` con cabecera contextual, estado 0/3–3/3 y tabs de asistencia, progreso y aviso. Dashboard, acciones rápidas y vista diaria de coach apuntan al mismo workspace.
- **Asistencia operativa**: acción masiva “todas presentes”, excepciones, notas y búsqueda. GET/POST validan tenant, academia, sesión y clase asignada; un coach ya no puede listar toda la asistencia de la academia sin `sessionId`.
- **Progreso con trazabilidad**: `athlete_assessments.session_id` conserva la sesión de origen; la API comprueba que la gimnasta pertenece a la clase, que modalidad/aparato son compatibles y deriva `assessedBy` del perfil autenticado. El cliente no envía `coachId`.
- **Modelo de miembros corregido**: `getClassAthletes` combina `classes.groupId`, `class_groups`, `group_athletes`, el vínculo legacy `athletes.groupId` y matrículas extra, siempre acotado por tenant/academia y sin borrados lógicos.
- **Migración**: Drizzle `0004_link_assessments_to_sessions.sql` y Supabase `20260713150000_link_assessments_to_class_sessions.sql`, aditivas y nullable con FK `ON DELETE SET NULL` e índice. Aplicada a PostgreSQL 17.6, rollback smoke y verificación de columna/FK/índice correctos. No se ejecutó seed global.
- **QA real**: storage state de coach y fixture temporal en la academia demo. Se persistieron 5 asistencias con una excepción tarde, una evaluación ligada a sesión+coach y un aviso con historial; después se purgaron sesión, atletas, vínculos, conversación, notificaciones y registros, verificando cero restos.
- **Accesibilidad y responsive**: Playwright autenticado 2/2; axe WCAG A/AA/2.2 AA sin violaciones tras corregir un contraste 4,43:1; viewport 375×667 sin overflow. La prueba queda parametrizada por `E2E_ACADEMY_ID`, `E2E_COACH_SESSION_ID` y storage state.
- **Integración paralela preservada**: se mergeó `bd2bb95a`, incluyendo terminología federativa en atletas, grupos, cobros, reportes y coaches. `CoachTodayView` conserva tanto sus labels sport-aware como el enlace al nuevo cockpit.
- **Gate integrado**: 276 APIs sin rutas riesgosas, RLS 64/64, 5 Drizzle + 29 Supabase, TypeScript/lint limpios, 425/425 pruebas, build de 214 páginas y `pnpm audit` con 0 vulnerabilidades.
- **Publicación**: commit funcional `9da6f020`, merge integrado `0a023880`, rama `codex/phase3-coach-today` y PR borrador #27. Deployment `dpl_68XGuYVFtQnrLbjWjhv17NtMpxH8` `READY`, alias `zaltyko.com`; smokes pricing 200, workspace privado 307 y APIs privadas 401. Escaneo de errores del deployment sin hallazgos.

## 2026-07-15 - Auditoria UX/UI integral y plan de rediseño por roles

- Se ejecuto la aplicacion local y se auditaron arquitectura de rutas, shells, roles, navegacion, tokens, componentes, estados y superficies publicas en desktop/movil.
- La navegacion publica disparo el tracking normal del producto: dos `POST /api/growth/events` respondieron 201. No se fabricaron formularios, cuentas ni fixtures y no se borro telemetria; estas visitas locales no deben interpretarse como evidencia comercial humana.
- Inventario: 167 paginas, 12 layouts, 30 loading, 3 error boundaries, 2 not-found, 61 primitivas UI y 43 componentes de dashboard. Conviven `/app/[academyId]/*`, `/dashboard/*` y `/super-admin/*`.
- Evidencia visual actual guardada en `test-results/product-redesign-audit-2026-07-15/`. El full-page de home fue rechazado como evidencia por repeticion visual del capturador; se conservaron capturas de viewport validas.
- Hallazgos P0: autoridad de rutas/shell, navegacion plana por modulos, inicio incorrecto para coach, barra movil con demasiados destinos, comunicacion fragmentada, dashboard basado en widgets y documentacion visual desalineada con tokens activos.
- Se documento una propuesta de principios, navegacion por rol, Design System 2.0, layouts, migracion por fases, riesgos y criterios de aceptacion. No se modifico ningun componente ni contrato backend.
- Limite: las superficies privadas se revisaron por codigo, contratos y evidencia E2E existente; la captura visual autenticada por cada rol queda como gate 0 antes de implementar.
- Vault: nueva `Auditoria UX UI integral - 2026-07-15.md`; actualizado `Inventario de producto.md`. Plan tecnico espejo en `docs/plans/2026-07-15-product-design-system-ux-roles.md`.
- Ampliacion autenticada autorizada por el usuario: owner y coach revisados en desktop/movil con sesiones QA locales; owner tambien en Gimnastas, Grupos y Planes/Cobros. Se confirmo que el dashboard se comprime en movil en vez de transformarse: barra con etiquetas solapadas, seis destinos owner, cards KPI enormes y FAB invadiendo navegacion.
- La sesion superadmin local y de produccion estaba caducada y redirigio a login; su auditoria se completo por componente/navegacion, dejando captura autenticada como gate pendiente. No existen storage states dedicados para admin, parent o athlete.
- El servidor previo en puerto 3000 entregaba chunks Next.js 404 y sus capturas parciales se rechazaron. La repeticion en instancia limpia 3002 no mostro esos 404; si detecto un hydration mismatch del input de busqueda del sidebar.
- Se amplio el plan para exigir reemplazo radical de homes, shell y menus por rol; no se modifico frontend.

## 2026-07-15 - Rediseño UX/UI: primera capa de shell y paneles

- Se inició la implementación posterior a la auditoría, manteniendo rutas, datos, permisos y contratos de backend.
- `src/app/globals.css`: canvas más silencioso, radios/bordes actualizados, selección y reduced-motion; se corrigió el tamaño móvil global que deformaba etiquetas de navegación.
- `AcademySidebar`: navegación agrupada por Operación, Relación y Control; se eliminó el botón duplicado de Ajustes y se priorizó Nuevo atleta como acción principal.
- `MobileAcademyNav`: máximo de cuatro destinos persistentes y menú “Más” para el resto, con targets táctiles y labels truncados para evitar solapamientos.
- `DashboardPage`: nuevo `OperationsPulse` con gráfico SVG interactivo por métrica (gimnastas, equipo, grupos, asistencia), alimentado exclusivamente por `/api/dashboard/kpi-trends` y con estado de datos reales.
- `CoachDashboardPage`: cabecera contextual orientada a la jornada, tarjetas y paneles con nueva jerarquía visual y mejor lectura móvil.
- `app/[academyId]/layout`: canvas y espaciado de contenido alineados con el nuevo sistema.
- Validado: `pnpm typecheck`, `pnpm lint` y `pnpm build` completados correctamente (Next 15.5.19; 219 rutas generadas). No se modificaron migraciones ni APIs.
- Pendiente: aplicar los mismos patrones a alumnos/familias, asistencia, pagos, comunicación, seguimiento técnico y superadmin; ejecutar captura E2E comparativa por rol.
- Vault: esta entrada y la auditoría/plan del 2026-07-15.

## 2026-07-15 - Rediseño UX/UI: superficies operativas de alumnos, grupos, asistencia y comunicación

- Encabezados de workspace (`PageHeader`) actualizados con la nueva jerarquía tipográfica, superficies y espaciado.
- Alumnos: la tabla de escritorio se transforma en fichas accionables en móvil, sin forzar scroll horizontal; conserva selección, alertas, grupo, familia y edición.
- Grupos: cards con acento de marca, superficies y estados vacíos alineados; el contenedor de la página ahora sigue el mismo ancho y breadcrumb que el resto del workspace.
- Asistencia: encabezado contextual, CTA principal consistente, tarjetas móviles y tabla de escritorio con estados visuales más limpios.
- Cobros: separación visual más clara entre plan SaaS y cobros a gimnastas mediante el encabezado canónico; se preservan los tabs y el flujo Stripe existente.
- Mensajes: shell de conversación elevado y encabezado de contexto; se mantiene la mensajería interna como canal principal.
- Validado: `pnpm typecheck` y `pnpm lint` limpios. Pendiente ejecutar build final y QA visual autenticada de este bloque.

## 2026-07-15 - Rediseño UX/UI: portal familia/gimnasta y superadmin

- `my-dashboard`: canvas acotado, alerta de pagos y métricas rápidas con superficies coherentes; la cabecera ahora comunica explícitamente “espacio familiar” o “progreso en pista” según el rol, con acciones de calendario/pagos legibles en móvil.
- Se mantuvo el selector de hijos, los widgets de progreso, asistencia, pagos, calendario y mensajería; no se ampliaron permisos del portal limitado.
- `SuperAdminDashboard`: las cinco métricas operativas principales conservan protagonismo y las cinco secundarias pasan a una banda compacta enlazada, reduciendo la sensación de diez tarjetas equivalentes sin ocultar información.
- Validado: `pnpm typecheck`, `pnpm lint` y `pnpm build` correctos; build Next 15.5.19 con 219 rutas generadas. No se modificaron APIs ni migraciones.
- Pendiente: QA visual E2E con sesiones parent/athlete y superadmin válidas; las sesiones disponibles en auditoría estaban caducadas.

## 2026-07-15 - Rediseño UX/UI: calendario, clases, eventos, reportes y ajustes

- `ClassesCalendarView`: grilla semanal reservada para escritorio; móvil muestra la agenda del día seleccionado para evitar tablas ilegibles y overflow.
- Clases y eventos: superficies, navegación semanal, leyendas, cards y estados vacíos alineados con el sistema; contenedores con ancho operativo común.
- Clases: métricas sin fuente real ya no muestran ceros engañosos; se presentan como “— / Sin serie disponible” hasta disponer de datos de sesiones.
- Reportes: encabezado canónico y jerarquía visual única para el hub de informes.
- Ajustes: cabecera de configuración renovada sin alterar tabs, guardado, branding, deporte ni Stripe Connect.
- Validado: `pnpm typecheck`, `pnpm lint` y `pnpm build` correctos; Next 15.5.19 generó 219 rutas.

## 2026-07-15 - QA visual autenticada y corrección de microcopy

- QA Playwright local en instancia limpia `http://127.0.0.1:3005` con storage state de propietario: dashboard desktop/móvil, Gimnastas y Entrenamientos; se verificaron rutas, navegación móvil, cards/listas responsive, chart interactivo y ausencia de errores de consola.
- La captura móvil confirmó que la navegación se reduce a cuatro destinos más “Más”, sin solapamiento de etiquetas; el dashboard mantiene CTA y jerarquía táctil legibles.
- Se detectó y corrigió pluralización defectuosa en Entrenamientos (`Entrenadoraes`, `Sesiónes`) usando `pluralizeFirstWord`; ahora las palabras terminadas en `-ión` generan plurales ortográficos (`Sesiones`, `Evaluaciones`).
- También se neutralizaron CTAs y descripciones con género incorrecto (`Nueva entrenamiento`, `Entrenamientos configuradas`) para que el copy siga siendo correcto cuando cambia la terminología deportiva.
- Se corrigieron breadcrumbs de Gimnastas y Entrenamientos para apuntar al dashboard canónico de la academia, no a `/dashboard` legacy.
- Validado tras la corrección: `pnpm typecheck`, `pnpm lint` y `git diff --check`; consola Playwright sin errores (solo warnings de desarrollo de Next/imagen).
- `pnpm build` completó la compilación de producción de Next 15.5.19 y generó 219 rutas; el servidor dev paralelo se detuvo después del build para no mezclar artefactos `.next`.
- Pendiente: QA autenticada equivalente para coach, parent/athlete y superadmin cuando existan storage states vigentes; no se inventaron cuentas ni datos.

## 2026-07-15 - Inicio y navegación dedicados para entrenadoras

- Se corrigió un defecto de arquitectura UX detectado en QA: el enlace `Dashboard` y `/app` enviaban a las entrenadoras al dashboard administrativo o a Gimnastas, en vez de abrir su cockpit de jornada.
- `getAcademyNavigation`, navegación móvil, `getPreferredHomePath`, `resolveUserHome` y el landing `/app` ahora resuelven `/app/[academyId]/coach` para el rol coach.
- El sidebar ya no muestra `Nuevo atleta` a entrenadoras; se mantiene visible para owner/admin/superadmin. Cobros, ajustes y gestión de equipo siguen fuera de su navegación.
- Los accesos directos a rutas administrativas redirigen al cockpit de entrenadora, no a un dashboard con permisos incorrectos.
- La ruta de Cobros también conserva ese destino seguro para accesos directos de coach, evitando una redirección genérica a `/dashboard`.
- Microcopy del empty state del coach corregido (`sesión`, `aparecerá`, `evaluación técnica`).
- Validado: `tests/product-roles-navigation.test.ts` (9/9), `pnpm typecheck`, `pnpm lint` y `git diff --check`; Playwright coach en `3006` sin errores de consola en `/coach` y `/app` resuelve al cockpit.

## 2026-07-15 - Afinado del panel Super Admin y bloqueo de sesión QA

- Se eliminó el selector de rango `7d/30d/90d/Todo` del dashboard superadmin porque no filtraba ninguna serie real; se sustituyó por el estado explícito `Datos actuales`.
- Las tendencias KPI ya no muestran una flecha `0%` cuando no existe periodo anterior comparable; el componente queda sin tendencia hasta disponer de una base real.
- El gráfico de usuarios por rol usa etiquetas localizadas (`Super administrador`, `Entrenador`, etc.) en lugar de claves internas.
- Se intentó QA browser del panel en `http://127.0.0.1:3007` con `.auth/super-admin.json`; Supabase respondió `Invalid Refresh Token: Already Used` y el Mac estaba bloqueado para renovar la sesión gráficamente. No se alteraron cuentas, contraseñas ni datos.
- Validado tras estos cambios: `pnpm typecheck`, `pnpm lint` y `git diff --check`.

## 2026-07-15 - Portal de familias y gimnastas: prioridad de jornada y progreso

- El portal ahora abre primero la agenda accionable de las próximas clases y mantiene el calendario como contexto, en lugar de dejar la agenda enterrada entre widgets.
- La selección de hijo respeta `?athleteId=` al abrir o compartir la vista familiar y se mantiene sincronizada con la navegación; la relación autorizada sigue validándose en servidor.
- La información financiera se limita explícitamente al rol tutor; la gimnasta conserva calendario, asistencia, progreso, evaluaciones y mensajería sin CTA de pagos.
- Las métricas sin registros ya no muestran `0%` como si fuera una medición real: usan `—` y copy de estado vacío. La leyenda de asistencia se adapta a pantallas estrechas.
- Validado: `tests/phase2-role-communication.test.tsx` (4/4), `tests/product-roles-navigation.test.ts` (9/9), `pnpm typecheck`, `pnpm lint`, `pnpm build` (219 rutas) y `git diff --check`.
- Pendiente: QA browser con una cuenta parent y athlete reales; no se inventaron credenciales ni fixtures.

## 2026-07-15 - Super Admin: estados honestos en visualizaciones

- Los gráficos de usuarios, planes y suscripciones ya no generan segmentos artificiales para representar “Sin datos”; muestran un estado vacío no interactivo y conservan el acceso al desglose solo cuando existe una fuente real.
- La serie de crecimiento de academias ya no presenta `+0` por ausencia de comparación; comunica “Sin variación” cuando corresponde y “Sin serie disponible” cuando aún no hay base temporal.
- Se eliminó la comparación demo entre academias porque no existía un endpoint de métricas reales detrás del control.
- QA browser reintentada con `.auth/super-admin-prod.json` en `http://127.0.0.1:3008`: Supabase respondió `refresh_token_not_found`; Firefox y WebKit tampoco están instalados localmente. No se alteraron cuentas ni datos.
- Validado: `pnpm typecheck`, `pnpm lint`, tests de roles (13/13), `pnpm build` (219 rutas) y `git diff --check`.

## 2026-07-15 - Pulso operativo: estados de carga y serie insuficiente

- `OperationsPulse` ya no presenta `0` ni una variación `Sin cambios` mientras la serie KPI está cargando o cuando no hay dos puntos comparables.
- El valor principal usa `—`, el badge comunica `Cargando datos`/`Serie actual` y el gráfico distingue entre carga y falta de datos suficientes.
- Validado: `pnpm typecheck`, `pnpm lint`, `pnpm build` (219 rutas) y `git diff --check`; no se modificó la fuente API ni se introdujeron métricas inventadas.

## 2026-07-15 - Sesiones QA parent, athlete y superadmin recuperadas

- Se provisionaron estados Playwright locales para parent, athlete y superadmin mediante el flujo E2E aprobado; no se registran contraseñas, tokens ni secretos en el repositorio.
- Los perfiles QA de parent/athlete quedaron vinculados a atletas existentes de la academia E2E y alineados con su tenant para que las rutas de mensajes/notificaciones respeten el aislamiento real.
- Se detectó y corrigió que `src/app` no tenía middleware reconocido en producción porque la implementación vivía en la raíz; `src/middleware.ts` reexporta la única implementación y conserva el gate de rutas, rate limit y pathname por rol.
- El gate superadmin verifica el JWT con `SUPABASE_JWT_SECRET` cuando existe y usa la API oficial `/auth/v1/user` como fallback validado cuando el secreto no está disponible; no confía en claims no verificados.
- QA de producción local: parent y athlete en `dashboard`, `messages`, `notifications`; superadmin en `dashboard`, `academies`, `users`; desktop y móvil sin overflow. Se guardaron capturas locales en `test-results/role-qa/`.
- Se corrigió el chart de línea/mini-chart para series de un solo punto, evitando coordenadas SVG `NaN`.
- Validado: typecheck, lint, tests de roles (13/13), `git diff --check` y build Next 15.5.19 con 219 rutas.

## 2026-07-16 - Comparativa final y retirada controlada de rutas legacy

- Se generó una comparativa visual real owner/parent en desktop y móvil en `test-results/comparativa-ux/`: shell global legacy frente a workspace moderno por rol, con navegación, hero, KPIs, agenda y acciones contextualizadas.
- Se corrigió la compatibilidad de redirects legacy en producción: el shell `dashboard` centraliza las entradas antiguas y usa `LegacyWorkspaceRedirect` para llevarlas de forma fiable a `/app/[academyId]/*`, evitando que el wrapper de observabilidad deje una respuesta 200 vacía.
- Owner validado en `dashboard`, `billing`, `settings`, `messages` y `classes/calendar`; parent validado en `dashboard` y `messages`. Las URLs finales resolvieron al workspace moderno de la academia E2E.
- Se mantiene una ventana de compatibilidad de seis meses; no se borran rutas ni se cambian contratos backend. La clasificación y criterios de retirada están en `docs/plans/2026-07-16-legacy-routes-compatibility.md`.
- Validado tras el fix: `pnpm typecheck`, `pnpm lint`, `pnpm build` (219 rutas) y smoke Playwright autenticado. No se modificaron migraciones ni datos de producto.

## 2026-07-16 - Día 1 de hardening: permisos baseline deny-by-default

- Cerrado el bypass AUTH-001/ROLE-001/MT-001: `withTenant` y `withBearerTenant` ya no condicionan la denegación a que exista `roleId`; toda capability registrada se comprueba y la ausencia de contexto de academia falla cerrada.
- Precedencia efectiva: `super_admin` conserva excepción global verificada; ownership solo nace de `academies.ownerId` o membership `owner` de esa academia; un rol custom activo y vigente sustituye el baseline; rol expirado, inexistente o inactivo deniega; sin rol custom se aplica baseline explícito de membership. El rol global solo distingue el portal limitado `parent`/`athlete` y nunca eleva privilegios administrativos.
- El contexto de academia considera params/query/JSON clonado/header, rechaza valores contradictorios y verifica el candidato contra ownership/membership en DB. Un `tenantId` del cliente no participa en la concesión.
- Se registraron capabilities para enrollments/waitlist, tutores, transacciones, invitaciones, desvinculación de memberships, envío de notificaciones y reembolsos. La desvinculación vuelve a comprobar `settings:users` sobre la academia real del vínculo.
- El scope familiar separa sujetos: `parent` resuelve solo atletas vinculados; `athlete` conserva su información operativa propia por `athletes.userId`, pero no obtiene scope financiero familiar. Tanto `/api/me/charges` como la carga RSC de cobros deniegan o evitan la consulta para `athlete`, cerrando una exposición detectada durante el gate final.
- Pruebas focalizadas: 41/41, más cobertura directa del bearer y del bloqueo financiero. Gate completo: typecheck y lint limpios; Vitest 508/508 (65 archivos); auditor estricto 292 rutas, 0 `risky`; RLS declarada 69/69; migraciones 6 Drizzle + 38 Supabase; build de producción 219 rutas; `git diff --check` limpio.
- No se cambiaron schemas, migraciones, datos, credenciales ni producción. Riesgo residual para Día 2: MT-002/003, porque `validate:rls` demuestra presencia de policies pero no least privilege intratenant con JWT parent/athlete/coach reales.
- Vault: actualizados `Changelog interno`, `Registro de riesgos` y `Backlog priorizado`; no se añadió decisión arquitectónica nueva.

## 2026-07-21 - Cierre local del Día 5 de auditoría UI

- Se verificó la compilación `next start` con el navegador integrado, en modo read-only, contra `/` y `/es/gimnasia-artistica` a 375×812 y 1440×900.
- El contrato actual `/` → cluster localizado es estable; `scrollWidth === innerWidth` en ambos viewports y las tarjetas se apilan sin clipping. Se enlazaron capturas nuevas en `docs/audit/evidence/ui/` y `docs/audit/UI_UX_AUDIT.md`.
- Se detectó autofill local en el formulario de login durante una captura; la evidencia fue sobrescrita y no se conservaron valores. No se aprovisionaron cuentas ni se ejecutaron acciones autenticadas.
- Quedan pendientes explícitos: sesiones visuales por rol y axe/Playwright con autorización. Los cuatro breakpoints 320/375/768/1440 px ya pasan el spot-check público sin overflow. No se declara conformidad WCAG completa.

## 2026-07-21 - Cierre local del Día 6: runtime y supply chain

- `pnpm verify:production` volvió a pasar completo: 293 APIs sin riesgos estáticos/semánticos, RLS 69/69, migraciones 6+40, typecheck, lint, 90 archivos/640 tests y build de 219 páginas.
- Se fijó runtime Node 20 (CI + `.nvmrc`, engines `>=20 <23`) y pnpm 9.15.3.
- `pnpm audit` detectó y resolvió `protobufjs@7.6.4` (CVE-2026-59877) mediante override `^7.6.5` y lockfile regenerado; la auditoría posterior quedó en cero vulnerabilidades.
- Pendiente P2: SBOM y política de bloqueo de advisories en CI. No cambia el no-go externo por KV/Brevo/Stripe/Vercel.

## 2026-07-21 - Cierre del Día 7 y decisión de release

- Regresión final local verde: `pnpm test:security` 90 archivos/640 tests, `pnpm verify:production`, auditor API sin `risky`/`semanticRisks`, RLS semántica estática PASS, migraciones 6+40 y build 219 páginas.
- Smoke UI público read-only en 320/375/768/1440 px sin overflow. No se ejecutaron escrituras, cobros, deploys, SQL remoto ni Playwright/axe adicional.
- **Decisión: NO-GO para producción.** Quedan bloqueos externos: promoción revisada de RLS Día 2/3, paridad Vercel KV/Brevo/WAF/alertas, Stripe sandbox/rotación/SCA, entrega de email y evidencia autenticada por rol.
- La auditoría queda lista para handoff; la decisión debe reabrirse únicamente con credenciales/aprobaciones y pruebas enlazadas.

## 2026-07-21 - Corrección de pendientes locales post-auditoría

- Se retiró `next-auth` porque no existen imports activos; Supabase Auth SSR queda como contrato canónico. `AGENTS.md`, `.env.example` y auditorías activas fueron alineados.
- Se añadió `pnpm audit:env` al CI para bloquear drift de `process.env.*` frente a `.env.example`.
- Se añadió audit de dependencias y SBOM CycloneDX como artifact CI. `pnpm audit:dependencies --prod` pasa sin vulnerabilidades.
- Uploads de imágenes y vídeos ahora centralizan allowlist, límites, magic bytes y rutas aleatorias; se añadieron 3 pruebas unitarias. Bucket privado/antimalware sigue pendiente de proveedor.
- Verificado: typecheck, lint, 91 archivos/643 tests de seguridad y build de 219 páginas.
- No se aplicaron migraciones ni cambios externos: Supabase CLI confirma que las migraciones locales no constan en el historial remoto; aplicar ese lote requiere revisión explícita porque incluye histórico completo.
- Se ejecutó `supabase db push --linked --dry-run` (read-only): el CLI propone el lote histórico completo, incluidas las migraciones Día 2/3. No se ejecutó `push` para evitar aplicar 40 migraciones fuera del ledger revisado ni alterar producción sin autorización específica.

## 2026-07-21 - Promoción controlada RLS Día 2/3

- Con autorización explícita se aplicaron `20260716181006_day2_rls_semantic_hardening.sql` y `20260716214500_day3_communication_academy_scope.sql` mediante `pnpm db:migrate:ledger --apply`, en una única transacción.
- El primer intento se revirtió porque una policy ya existía; se hizo idempotente el lote (`DROP POLICY IF EXISTS`) y la segunda ejecución aplicó ambos cambios correctamente. Verificación posterior: 40/40 migraciones, 234 policies públicas y 119 tablas públicas con RLS.
- No se usó `supabase db push`, no se leyeron filas de producto y no se alteraron datos de negocio. PostgREST/Realtime y least-privilege de dominios secundarios siguen pendientes.
- Playwright Chromium autenticado pasó 12/13 pruebas; axe público pasó landing/login. La prueba responsive y axe autenticado quedan abiertos por timeout/fallo de carga.

## 2026-07-21 - Stripe sandbox y webhook Connect

- La cuenta Stripe test, balance y precios respondieron 200; el único endpoint Connect estaba configurado con un túnel Cloudflare efímero y se actualizó a `https://zaltyko.com/api/stripe/connect/webhook`.
- Se creó un PaymentIntent de prueba con tarjeta 3DS que devolvió `requires_action` y se canceló inmediatamente; no se ejecutó ningún cargo real. Falta verificar secreto de firma y entrega end-to-end desde el dashboard.

## 2026-07-21 - Storage remoto privado verificado

- El bucket Supabase `uploads` quedó/permanece privado y se configuró con MIME de imágenes/vídeos permitidos y límite de 50 MiB, máximo aceptado por el plan remoto.
- Una carga temporal con service role devolvió 200, la lectura anónima devolvió 400 y el objeto fue eliminado. Antimalware y URLs firmadas/proxy compatibles siguen pendientes.
- El límite de `VIDEO_UPLOADS` y el copy de la API se redujeron de 100 MiB a 50 MiB para no ofrecer un contrato que el plan remoto rechaza.

## 2026-07-21 - Smoke autenticado real en producción

- Se generó un storage state owner contra `https://zaltyko.com` sin aprovisionar usuarios ni mutar datos. Chromium pasó 11/11 rutas core y 4/4 pruebas responsive/teclado/PWA; axe autenticado pasó dashboard y athletes.
- Axe público detectó dos contrastes WCAG AA en la landing desplegada. El fix se mergeó en `main` mediante PR #52; el workflow confirmó que faltan credenciales Vercel y no hizo deploy, por lo que axe sigue fallando en la URL pública.
- **Cierre externo parcial 2026-07-21:** se generó y verificó una `BREVO_API_KEY` real (HTTP 200 en `/v3/account`) y se cargó como secreto Sensitive en Vercel Production/Preview; no se envió correo. PR #53 corrige el contraste restante del badge de comparación y quedó en cola de build Vercel; no se cierra A11Y hasta repetir axe público con deployment `Ready`.
- **Cierre externo ampliado 2026-07-21:** se provisionó Upstash Redis Free en Vercel y se conectó a Production/Preview con prefijo `KV_REST_API`; el Firewall publicó una regla de 30 requests/60 s por IP para `/api/auth`. Storage `uploads` sigue privado (50 MiB, MIME allowlist). Vercel Alerts/Bot Protection/OWASP requieren plan superior; antimalware externo sigue pendiente.
- **E2E por roles 2026-07-21:** se actualizaron usuarios aislados owner/coach/super-admin y se regeneraron sesiones Production; role smoke Chromium pasa 10/10. Parent/athlete QA también obtuvieron sesiones nuevas y llegan a `/dashboard/profile`; PR #54 corrige dos hallazgos axe de listas de descripción, pendiente de deployment y repetición.
- **Cierre E2E/a11y 2026-07-21:** PR #54 (`f8c307d`) quedó desplegado. Axe parent/athlete en `/dashboard/profile` pasa 0 violaciones; axe público landing/login y owner dashboard/athletes también pasan. Se mantiene pendiente la revisión manual WCAG (foco, zoom y lector de pantalla).
- **Gate local 2026-07-21:** `immutable@3.8.3` transitivo de Swagger elevaba dos advisories altos; override actualizado a `^4.3.9`. `verify:production` pasa con 91 archivos/643 tests, build de 219 páginas, typecheck/lint y audit high/critical verdes; queda una baja y una moderada transitivas.

## 2026-07-21 - Rotación Stripe Connect y redeploy

- El secreto de firma del endpoint Connect se rotó en Stripe Workbench con verificación 2FA y se copió únicamente como variable Sensitive de Vercel Production (`STRIPE_CONNECT_WEBHOOK_SECRET`); no se registró ningún valor secreto.
- Se solicitó el redeploy de Production `CugHPvZEr` para consumir la variable nueva. Al congelar esta evidencia seguía en estado `Building`; no se declara entrega firmada end-to-end hasta observar `Ready` y un evento benigno 2xx.
- El riesgo de rotación 2FA queda cerrado; permanecen como bloqueos externos el scanner antimalware y las alertas gestionadas de Vercel Hobby.

## 2026-07-23 - Cierre funcional del mapa de objeciones

- Se consolidó la matriz de cierre en `docs/plans/2026-07-23-objection-closure-matrix.md`, con respuesta aprobada, capacidad, evidencia, estado y criterio de cierre para las 12 objeciones del comprador principal.
- Se autoriza explícitamente rediseñar, simplificar, ampliar o sustituir módulos cuando mejore claridad, adopción, accesibilidad, rendimiento, conversión o eficiencia operativa. Se mantienen como límites no sustituibles la seguridad, el aislamiento multiacademia, los pagos, la trazabilidad y la compatibilidad/migración.
- El flujo de soporte quedó alineado con el esquema Drizzle y las respuestas API estandarizadas; la pantalla de academia ya lista tickets por tenant y la creación redirige al detalle canónico.
- Validación local del cierre: `pnpm test -- --run` 103 archivos/674 tests, `pnpm lint`, `pnpm typecheck`, auditoría API y `pnpm verify:production` en verde. Quedan fuera de cierre automático las entrevistas/trials reales, QA humano de familias, exportación federativa de eventos y SLA histórico de soporte.
- Segunda pasada de claims: se retiraron o matizaron promesas no demostradas de lectura garantizada, canales externos, workflows clínicos/de lesión, sincronización de calendarios y comparativas entre academias. El gate final volvió a pasar: build de 224 páginas y todos los invariantes en verde.
- Exportación de eventos implementada en `/api/reports/events/export`: XLSX filtrable por academia, evento y fechas, con ubicación, estado, inscripción y participantes dentro del tenant autorizado. Se mantiene fuera de promesa el formato federativo automático específico.
- El panel Super Admin Growth incorpora academias activadas distintas a partir de `growth_events.academy_activated`, sin fabricar tasas cuando no existe denominador. Esto deja trazable la objeción de adopción/valor sin convertir actividad de navegador en evidencia de cliente.
- Growth calcula además el time-to-value medio con pares server-side `academy_created` → `academy_activated`; si no hay pares válidos muestra ausencia de base. No se publican horas de ahorro ni ROI sin trials observados.
- La exportación de eventos quedó visible en el Centro de reportes de la academia, con copy explícito de alcance y limitación federativa antes de descargar.
- Soporte: los detalles de academia y Super Admin ya leen Drizzle y respetan el perfil real; las respuestas internas se filtran para usuarios de academia y solo quedan visibles para Super Admin.
- Nueva auditoría de claims públicos: se matizaron promesas de listados federativos oficiales, exportables para federaciones, sincronización de viajes, entrega garantizada de mensajes e inscripciones sin errores. Claims catalogados y guardrails públicos siguen pasando.
- Se creó `docs/plans/2026-07-23-objection-closure-runbook.md`, con owner, acción, evidencia y aceptación para cada una de las 12 objeciones. El runbook separa explícitamente evidencia local, sandbox, producción y validación humana.
- El Centro de reportes incorpora un catálogo visible de salida de datos y la exportación de atletas respeta ahora `academyId`, evitando que una descarga iniciada desde una academia mezcle datos de otras sedes del mismo tenant.
- Se simplificó el formulario de respuestas de soporte: se retiró temporalmente el selector de adjuntos porque la API aún no los persiste. Se mantiene la visualización de adjuntos históricos y se evita ofrecer una acción que no tiene contrato funcional.
- El Centro de reportes deja de mostrar controles de reportes programados cuando la feature está deshabilitada; muestra el alcance pendiente en lugar de exponer una acción que respondería `501`.
- El endpoint residual de ejecución de analítica avanzada dejó de responder `501`; ahora falla cerrado como `FEATURE_DISABLED` hasta que exista el contrato completo de ejecución.
- Endpoints no expuestos de reportes programados y rúbricas/tipos de evaluación ahora fallan cerrado como `FEATURE_DISABLED` en vez de anunciar una operación `501`; la UI no los ofrece a clientes en el primer alcance.
- Se añadió `tests/audit/objection-closure.contract.test.ts`, que protege los artefactos del mapa, el runbook, las exportaciones por tenant, la lista de espera, el filtrado de respuestas internas y los claims retirados.
- La lista de espera de clases dejó de consultar el endpoint incorrecto de reportes y ahora consume `/api/class-waiting-list`, valida la respuesta estandarizada y muestra las entradas reales del tenant.
- Se retiró el botón de adjuntos deshabilitado del compositor de mensajes; el flujo queda simplificado a texto hasta disponer de almacenamiento y permisos de archivos completos.

## 2026-07-30 - Marketing: brief para alinear copy de acrobática y trampolín

- Siguiente acción de Marketing tras el cierre de [ZAL-22](/ZAL/issues/ZAL-22): la auditoría de Content dejó escrito que "acrobática y trampolín están publicadas en SEO pero no deben prometerse como soporte activo".
- Brief redactado en `vault/04-Marketing/Brief - Copy acrobática y trampolín.md` con ángulo ("estamos especializados en artística y rítmica, acrobática y trampolín están en el roadmap"), claim permitido, mensaje guía por canal, exclusiones y criterio de éxito. Buyer = dueño/director de academia; países prioritarios = ES, MX, AR.
- Issue hijo abierto: [ZAL-38](/ZAL/issues/ZAL-38), asignado a Content (5d63f5f6) en el proyecto Growth & Content, prioridad medium. Owner ejecutivo: Content; valida Marketing; aprueba el board si el cambio excede lo autorizado por `Mensajes aprobados.md`.
- Esta tarea no depende de la decisión `2026-07-29` (ventas congeladas): es corrección de promesa, no campaña de conversión. Puede entrar en cualquier hueco de sprint.
- Sin movimiento de rutas, redirects ni SEO canónico; la Opción A (compat 6 meses) sigue activa.
- Vault: nueva nota `vault/04-Marketing/Brief - Copy acrobática y trampolín.md`; este changelog. Sin código tocado.

## 2026-08-10 - Reconciliación de alerta presupuestaria con decisión vigente del board

- El dashboard registró `393.135` centavos acumulados en agosto (`3.931,35 USD`); el presupuesto técnico vigente del backend es `1.000.000` centavos (`10.000 USD`), por lo que el consumo es `39,31 %` del cap vigente.
- La causa observable sigue siendo principalmente `provider_quota`: hoy fueron `42/51` fallos y en el mes `389/684` fallos. La prioridad sigue siendo cerrar failover, circuit-breaker y retry-cap, no abrir más meta-trabajo.
- Se generó una solicitud de contención duplicada [f8e4c2bd-6bd3-4689-9a39-c07123d3d4ff](/ZAL/approvals/f8e4c2bd-6bd3-4689-9a39-c07123d3d4ff) al aplicar por error el cap histórico de `1.000 USD`; no se ejecutó ninguna pausa ni aumento de cap. La decisión vigente del board es no volver a escalar presupuesto hasta superar `10.000 USD`.
- Separación de evidencia: gasto agregado de control-plane y decisión de gobernanza; no implica readiness de producto, adopción, producción ni autorización para secretos, pagos reales o publicaciones.
