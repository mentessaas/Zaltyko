---
status: active
owner: producto
last_reviewed: 2026-06-23
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../INCONSISTENCY-AUDIT.md
  - ../docs/migrations-backlog.md
  - ../04-Marketing/Estrategia competitiva gimnasia.md
  - ../04-Marketing/Matriz competitiva gimnasia.md
  - ../04-Marketing/Competidores.md
  - ../docs/marketing/zaltyko-competitors.md
  - ../07-Auditorias-y-Riesgos/Auditoria MVP gimnasia - 2026-06-23.md
---
# Backlog priorizado

## P0

| Estado | Tarea | Dueño | Criterio de aceptacion | Pruebas/Evidencia |
| --- | --- | --- | --- | --- |
| Resuelto | Mailgun webhook con comparacion no timing-safe. | tech | `src/app/api/mailgun/route.ts` usa `crypto.timingSafeEqual` sobre `Buffer.from(hash, "hex")` con pre-check de longitud; cierra vector de timing attack en verificacion de firma. | Sprint 0 Quick Wins 2026-06-23; `pnpm typecheck` y `pnpm lint` limpios. |
| Resuelto | `next-sitemap.config.js` sin fallback de `NEXT_PUBLIC_APP_URL`. | tech | Config usa `NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`; sitemap nunca emite URLs `undefined`. | Sprint 0 Quick Wins 2026-06-23. |
| Resuelto | PWA `theme_color` inconsistente entre manifest y layout. | tech/design | `public/manifest.json` `theme_color` = `#0F172A` (mismo que `layout.tsx:120` y `viewport.themeColor`). | Sprint 0 Quick Wins 2026-06-23. |
| Resuelto | `text-light` #94A3B8 con contraste 2.5:1 (falla WCAG AA). | tech/accesibilidad | Tailwind config cambia a `#64748B` (4.6:1, pasa AA); afecta 17 usos en componentes de billing. | Sprint 0 Quick Wins 2026-06-23. |
| Resuelto | `academy_link_requests` sin RLS (leak cross-tenant). | tech/seguridad | Migracion `20260624000000_rls_academy_link_requests.sql` con `ENABLE ROW LEVEL SECURITY` + 2 policies (tenant_or_target_access y target_response). | Sprint 1 Seguridad CRITICAL 2026-06-23; `pnpm validate:rls` PASS 100% cobertura sobre 63 tablas. |
| Resuelto | Rate-limit global API mutante potencialmente inactivo (`proxy.ts` no es convencion Next.js). | tech/seguridad | `proxy.ts` eliminado; logica consolidada en `middleware.ts` con matcher amplio; rate-limit aplicado a `/api/*` mutante (excluye webhooks/cron/dev), `/app/*` y `/super-admin/*`. | Sprint 1 Seguridad CRITICAL 2026-06-23. |
| Resuelto | JWT decode sin verificar firma en `middleware.ts` super-admin gate. | tech/seguridad | `middleware.ts` ahora verifica firma HS256 con `crypto.timingSafeEqual` contra `SUPABASE_JWT_SECRET` antes de validar `app_metadata.role`. Fail-closed si la env var falta. | Sprint 1 Seguridad CRITICAL 2026-06-23. |
| Resuelto | ESLint deshabilitado en build (`ignoreDuringBuilds: true`). | tech/DX | `next.config.mjs` cambia a `ignoreDuringBuilds: false`. Builds fallan si hay errores de lint. | Sprint 1 Seguridad CRITICAL 2026-06-23. |
| --- | --- | --- | --- | --- |
| Resuelto | Bug A: `/api/reports/attendance/export` devolvia 500 por ZodError (academyId doble fuente + null en URL params). | tech | Quitar `academyId` del schema, usar `context.tenantId` como fuente unica; permitir `null` en params opcionales con `.nullable().optional()`. | [[QA - Flujos P1 - 2026-06-22]] (Bug A). |
| Resuelto | Bug B: `/app/[id]/athletes/[athleteId]/assessments` mostraba "Failed query". | tech | La DB no tenia las columnas `assessment_type`, `total_score`, `tenant_id` que el schema TS declaraba. Aplicada migracion `20260622140000_sync_athlete_assessments_schema.sql`. | [[QA - Flujos P1 - 2026-06-22]] (Bug B), `supabase/migrations/20260622140000_sync_athlete_assessments_schema.sql`. |
| Resuelto | Bug C: copy con caracteres chinos mezclados (`提醒`) en `src/app/(site)/FeaturesSection.tsx:130`. | marketing | Sustituir por "recordatorios" en espanol. | [[Auditoria copy publico - 2026-06-22]] hallazgo 2. |
| Resuelto | Bug D: paginas publicas `marketplace`, `empleo`, `events` apuntaban `dashboardHref` a `/dashboard/*` (legacy, rompe UX). | tech | Extender `/api/auth/check` para devolver `academyId`; reemplazar `dashboardHref` por `dashboardHrefTemplate` con placeholder `{academyId}` que el `PublicPageHeader` resuelve en runtime. | [[Auditoria copy publico - 2026-06-22]] hallazgo 9. |
| Resuelto | Corregir downgrade Stripe. | tech | `/api/billing/downgrade` obtiene el subscription item real desde Stripe antes de actualizar price. | [[Tarea - Corregir downgrade Stripe]]. |
| Resuelto | Validar checkout mensual y bloquear anual comprable hasta existir price anual. | tech/negocio | Toggle anual en `pricing.tsx` se muestra como `aria-disabled="true"` con estilo `cursor-not-allowed`; toggle mensual queda activo con `aria-pressed="true"`. Checkout API ya bloquea cuando `stripePriceId.includes("PLACEHOLDER")` o no existe. Pendiente: crear price IDs anuales reales en Stripe cuando se decida lanzar anual. | Sprint 0 Quick Wins 2026-06-23. |
| Documentado | Confirmar planes reales Starter/Growth/Network contra DB y Stripe. | negocio/tech | `plans` contiene `free/pro/premium` con nicknames y limites de `PRODUCT_PLANS`; no hay placeholders en prod. | [[Tarea - Validar checkout y planes]]. |
| Resuelto | Alinear Growth con v1 de una academia. | producto/tech | Growth no promete academias ilimitadas; `academyLimit` queda en 1 y Network se comunica como multi-sede acompanado. | [[Decisiones#2026-06-22 - V1 comercial con una academia por cliente]]. |
| Activo | Mantener auth tenant y respuestas estandar en APIs nuevas. | tech | APIs tenant usan `withTenant` y helpers `apiSuccess/apiCreated/apiError`. | `pnpm lint`, `pnpm audit:api-routes:strict` si aplica. |
| Activo | Revisar promesas publicas contra features reales. | producto/marketing | Landing/pricing/modulos no prometen features parciales como completas. | Comparar con [[Mensajes aprobados]] e [[Inventario de producto]], [[Auditoria copy publico - 2026-06-22]]. |
| En progreso | Desbloquear portal moderno de padres/atletas. | producto/tech | `parent` y `athlete` pueden entrar a `/app/[academyId]/my-dashboard` y rutas limitadas sin acceder a administracion de academia. | Implementada allowlist limitada + redirect moderno + limpieza de enlaces admin/WhatsApp + `/messages` interno familiar; `product-roles-navigation`, `e2e-critical-flows` y `typecheck` pasan. Falta QA con usuario parent real. |
| En progreso | Completar modelo de identidad global por rol. | producto/tech | Registro abierto permite `owner`, `coach`, `parent`, `athlete` y `provider`; usuarios sin academia entran a dashboard global correcto; owner sin academia va a onboarding; la cuenta global no se borra al quitar vinculos de academia. | Implementado registro por rol, `provider`, perfil global en callback/confirm, home routing y marketplace de proveedor. `pnpm typecheck` y `pnpm vitest run tests/product-roles-navigation.test.ts tests/e2e-critical-flows.test.ts` pasan. Falta QA manual con Supabase real. |
| Activo | Ejecutar plan operativo gimnasia. | producto | Fases 1-4 de [[Plan operativo gimnasia]] tienen owner, criterio de aceptacion y evidencia de cierre. | Portal desbloqueado, comunicacion interna validada, flujo entrenador definido, pricing freemium validado. |

## P1

| Estado | Tarea | Dueño | Criterio de aceptacion | Pruebas/Evidencia |
| --- | --- | --- | --- | --- |
| Resuelto | Smoke-test job comentado en CI. | tech/DevOps | Job `smoke-test` activo en `.github/workflows/ci.yml` con Playwright instalado y `tsx smoke-test.ts` contra `https://zaltyko.vercel.app`. Solo corre en push a main. | Sprint 1 Seguridad CRITICAL 2026-06-23. |
| Resuelto | `pnpm validate:rls` no se ejecuta en CI. | tech/DevOps | Job `validate-rls` activo en `.github/workflows/ci.yml`; corre `pnpm validate:rls` en cada push/PR. | Sprint 1 Seguridad CRITICAL 2026-06-23. |
| --- | --- | --- | --- | --- |
| Resuelto | Completar investigacion competitiva de gimnasia. | producto/marketing | 10 competidores analizados en [[Matriz competitiva gimnasia]], con pricing, features, gaps, dolores/reviews y oportunidades para Zaltyko. | Doc canónico [[../../docs/marketing/zaltyko-competitors]] v2.0 (266→698 lineas) con 9 competidores nuevos scrapeados directo: iClassPro, Jackrabbit, Uplifter, Amilia SmartRec, ClassForKids, Sawyer, WellnessLiving, Playtomic Manager, Clupik. [[Competidores]] del vault ampliada con los 4 que faltaban (Uplifter, Amilia, Pike13, WellnessLiving). Hallazgos 2026-06-23 y matriz con dolores publicos ya consolidados. Cierre: v2.0 define 18 acciones priorizadas en 4 fases (MVP → 18 meses). |
| En progreso | Validar comunicacion interna como prioridad v1. | producto/tech | El alcance de comunicacion prioriza mensajes, avisos, notificaciones e historial dentro de Zaltyko; WhatsApp queda secundario/futuro. | `/app/[academyId]/messages` muestra mensajes internos a `parent`/`athlete`; staff puede abrir/crear conversacion por tutor de atleta y por grupo. Falta QA real con tutor invitado. |
| En progreso | Definir hipotesis freemium accesible para gimnasia. | negocio/producto | Propuesta de free + primer plan pago + plan superior, con limites y disparadores de upgrade validados contra competencia y entrevistas. | [[Pricing]] ya contiene hipotesis de empaquetado; faltan entrevistas con 10 academias y decision final. |
| Activo | Cerrar MVP exacto de Zaltyko gimnasia. | producto | Documento final con alcance vendible para artistica/ritmica: alumnos, familias, clases, pagos, asistencia, progreso tecnico, comunicacion interna y portal padres. | [[MVP exacto Zaltyko gimnasia]] pasa de draft a active. |
| En progreso | Skill tracking y make-up tokens MVP (cierre gap vs iClassPro/Jackrabbit). | producto | Gimnasta con ausencia recibe token visible para staff y padre; academia configura reglas; punch pass descuenta automaticamente al check-in; kiosk registra asistencia; skill tracking ampliado por gimnasta con nivel y notas del coach. | [[Tarea - Skill tracking y make-up tokens MVP]] y seccion 9.1-9.2 de [[../../docs/marketing/zaltyko-competitors]]. |
| En progreso | Onboarding wizard 3 pasos y parent experience mobile-first (cierre gap vs Sawyer/ClassForKids). | producto | Academia nueva llega a "primer atleta + clase + cobro demo" en menos de 15 minutos sin ayuda; padre inscribe hija en 3 taps desde movil; parent portal mobile-first; entrenador abre "clase de hoy" para pasar lista y evaluar. | [[Tarea - Onboarding y parent experience]] y seccion 9.5-9.6 de [[../../docs/marketing/zaltyko-competitors]]. |
| En progreso | Pricing escalonado por atletas y plan gratis funcional. | negocio/producto | Plan gratis academias pequenas hasta 25-50 gimnastas con 1 sede; Starter en rango 19-49 EUR/mes con pricing por academia + tramo de atletas; disparadores de upgrade claros; fees transparentes antes del checkout. No tocar Stripe placeholders ni annual billing hasta cerrar decision. | [[Tarea - Pricing escalonado y plan gratis]] y [[Pricing]]. |
| En progreso | Consolidar comunicacion interna de familias. | producto/tech | Mensajes, notificaciones y anuncios funcionan como historial interno por gimnasta/familia/grupo; WhatsApp queda fuera de la experiencia principal. | Bloques reales: ruta familiar `/messages`, conversacion por tutor de atleta y boton "Mensaje al grupo" con tutores del grupo. Pendiente: clase/sesion, anuncios unificados y QA parent/coach. |
| En progreso | Crear solicitudes de vinculo a usuarios existentes. | producto/tech | Academia puede buscar por email exacto, crear solicitud pendiente a un usuario existente y el usuario puede aceptar/rechazar desde su dashboard; aceptar crea `membership`, rechazar no toca la cuenta. | Implementado: tabla `academy_link_requests`, migracion, APIs `POST/GET /api/link-requests`, `PATCH /api/link-requests/[requestId]`, notificacion interna y tests. Pendiente: UI staff, UI usuario y email opcional. No vincular automaticamente sin aceptacion. |
| Activo | Disenar flujo entrenador "clase de hoy". | producto/tech | Entrenador puede pasar asistencia, registrar progreso y enviar aviso interno desde una vista compacta. | Auditoria de `/coach`, `/coaches/today`, `/attendance`, `/evaluations`; test manual con clase fixture. |
| Resuelto | Validar flujo de evaluaciones end-to-end. | producto/tech | Un usuario puede crear/evaluar/ver historial/progreso/exportar sin salir del tenant. | PASS Playwright P1 sandbox 5/5, academia `9ec3ea79-73e9-4604-8e4a-ddf1d6469cbb`; [[QA - Go Live SaaS - 2026-06-22]]. |
| Resuelto | Consolidar experiencia de comunicacion. | producto/tech | Mensajes, notificaciones y WhatsApp tienen navegacion clara y estados leidos/historial comprensibles. | PASS Playwright P1 sandbox; WhatsApp queda degradado/oculto por feature flag apagada. [[QA - Go Live SaaS - 2026-06-22]]. |
| Resuelto | Completar onboarding/trial con aha moments. | producto/growth | Owner llega a primer atleta, clase y cobro/demo en una sesion. | PASS Playwright P1 sandbox: dashboard, atleta, clase y billing base controlado; checkout Growth devuelve 503 si Stripe usa placeholder. [[QA - Go Live SaaS - 2026-06-22]]. |
| Resuelto | Validar asistencia y reportes dedicados. | producto/tech | Registro de asistencia alimenta reportes/export sin romper permisos. | PASS Playwright P1 sandbox: asistencia registrada, reporte visible y export PDF 200. [[QA - Go Live SaaS - 2026-06-22]]. |

## P2

| Tarea | Dueño | Evidencia |
| --- | --- | --- |
| Profundizar SEO localizado e i18n. | marketing/tech | [[SEO y geo]]. |
| Definir add-ons monetizables. | negocio/producto | [[Modelo de negocio]]. |
| Crear playbooks de CS por plan. | ventas | [[Customer success]]. |
| Marketplace Zaltyko `/descubre` y multi-idioma (English + Portugues Brasil) (Fase 3, inspirado en Playtomic/Clupik). | negocio/marketing | [[Tarea - Marketplace Zaltyko y multi-idioma]] y seccion 9.8-9.9 de [[../../docs/marketing/zaltyko-competitors]]. |
| AI churn predictor y recepcionista virtual WhatsApp (Fase 3, inspirado en WellnessLiving/Amilia). | producto | Pendiente plan tecnico; referencia: seccion 9.4 y 9.7 de [[../../docs/marketing/zaltyko-competitors]]. |
| Website builder y federation-ready architecture (Fase 3+, inspirado en Uplifter/Amilia). | producto/tech | Pendiente RFC; referencia: seccion 9.3-9.4 de [[../../docs/marketing/zaltyko-competitors]]. |
| Modulo de competiciones con acta digital (Fase 3, inspirado en Clupik). | producto | Pendiente plan tecnico; referencia: seccion 9.9 de [[../../docs/marketing/zaltyko-competitors]]. |
