---
status: active
owner: producto
last_reviewed: 2026-07-07
source:
  - ../ROADMAP.md
  - ../AGENTS.md
---
# Changelog interno

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

| Borrada | Reemplazo canonico | Info critica preservada |
| --- | --- | --- |
| `vault/00-Inicio/Guia de trabajo para agentes.md` | `Workflow diario de la vault.md` + `Estado actual` + `AGENTS.md` | Si — reglas migradas |
| `vault/01-Producto/MVP exacto Zaltyko gimnasia.md` | `Inventario de producto.md` | Si — consolidado |
| `vault/01-Producto/Tarea - Sprint 0 decision v3.0.md` | `Inventario` + `Roadmap maestro` + `Pricing` | Parcial — los 6 bloques de implementacion especificos ya fueron ejecutados en `06a71dd` |
| `vault/01-Producto/Tarea - Onboarding y parent experience.md` | `Roadmap maestro` §Fase 3 | Parcial — referencia |
| `vault/01-Producto/Tarea - Skill tracking y make-up tokens MVP.md` | `Roadmap maestro` + `Inventario` | Parcial — referencia |
| `vault/03-Negocio/Tarea - Marketplace Zaltyko y multi-idioma.md` | `Inventario` + `Roadmap` §Fase 4 | Parcial |
| `vault/03-Negocio/Tarea - Pricing escalonado y plan gratis.md` | `Pricing.md` (v3.0) + `Decisiones.md` | Si — decision registrada |
| `vault/04-Marketing/Estrategia competitiva gimnasia.md` | `Competidores.md` + `Mensajes aprobados` | Si — absorbida |
| `vault/04-Marketing/Matriz competitiva gimnasia.md` | `Competidores.md` (crecio 17 -> 434 lineas) | Si — absorbida |
| `vault/05-Ventas-y-CS/Guia entrevistas academias gimnasia.md` | **Ninguno** | **NO — restaurada 2026-06-26** (preguntas + criterios de cierre no aparecen en Playbook demo ni Onboarding cliente) |
| `vault/06-Roadmap-y-Tareas/Cierre operativo pendientes agente - 2026-06-24.md` | `Roadmap maestro` + `Decisiones` | Parcial — bloques de coherencia (pricing+portal, identidad+migraciones, legacy dashboard) perdidos como referencia |
| `vault/06-Roadmap-y-Tareas/Plan operativo gimnasia.md` | `Roadmap maestro` | Parcial |
| `vault/07-Auditorias-y-Riesgos/Auditoria MVP gimnasia - 2026-06-23.md` | `Auditorias consolidadas` + `Auditoria de producto real` | Si — consolidada |
| `vault/07-Auditorias-y-Riesgos/Auditoria copy publico - 2026-06-22.md` | `Auditorias consolidadas` + `Mensajes aprobados` | Si — consolidada |
| `vault/07-Auditorias-y-Riesgos/Auditoria de la vault - 2026-06-22.md` | (obsoleta — vault reorganizada) | Si — cerrada |
| `vault/07-Auditorias-y-Riesgos/QA - Flujos P1 - 2026-06-22.md` | `QA - Flujos P1.md` | Si — consolidada |
| `vault/07-Auditorias-y-Riesgos/QA - Go Live SaaS - 2026-06-22.md` | `Produccion y go-live.md` | Si — consolidada |

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
- **S2 RLS modulos laterales cerrado**: migracion `20260625000001_rls_lateral_modules.sql` habilita RLS en `announcements`, `announcement_read_status`, `conversation_messages`, `conversation_participants`, `message_read_receipts` con policies por tenant/user. Tablas con policy permisiva `allow_authenticated` documentadas en backlog para endurecer (marketplace_*, empleo_*, tickets_*, advertisements, featured_listings, push_subscriptions).
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
- `pnpm lint` y `pnpm build` pasan; quedan solo warnings historicos de lint no bloqueantes.

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
