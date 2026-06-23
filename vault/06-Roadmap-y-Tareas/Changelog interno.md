---
status: active
owner: producto
last_reviewed: 2026-06-23
source:
  - ../ROADMAP.md
  - ../AGENTS.md
---
# Changelog interno

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

## 2026-06-23 - Sprint 2 (Base de Datos) ejecutado parcialmente

- **S6 SELF_SIGNED_CERT_IN_CHAIN resuelto**: certificado CA raiz de Supabase extraido a `certs/supabase-root-ca.crt` (publico, commiteado al repo). `drizzle.config.ts` ahora carga `.env.local` ademas de `.env`. Nuevo script `scripts/db-migrate.ts` resuelve `NODE_EXTRA_CA_CERTS` a ruta absoluta y ejecuta `drizzle-kit push` con env vars correctas. `scripts/dump-schema.ts` y `scripts/check-fks.ts` con SSL fix para diagnostico. `scripts/apply-migration.ts` ya funcionaba en `NODE_ENV=production` por su `ssl: { rejectUnauthorized: false }`. `.env.example` documenta `NODE_EXTRA_CA_CERTS`.
- **S3 drift Drizzle↔SQL parcialmente cerrado**: `pnpm db:migrate` ahora conecta. Dump del schema real revela que **25 tablas del schema TS NO EXISTEN en DB** (academy_link_requests creado en Sprint 1, academy_roles, assessment_rubrics, athlete_documents, class_exceptions, class_waiting_list, competition_results, event_categories, event_payments, event_registrations, event_waitlist, federative_licenses, leads, leak_action_history, message_groups, message_history, message_templates, notification_preferences, push_tokens, role_members, rubric_criteria, scheduled_notifications, scheduled_reports). Migracion `20260625000000_apply_pending_migrations.sql` crea el modulo leak-profitability (academy_diagnostics, academy_expenses, churn_reasons, coach_compensation) que estaba pendiente desde 0001 y registra 0001/0002 en `__drizzle_migrations`. Drift menor en `academy_diagnostics` (score/yes_count) queda documentado.
- **S4 añadir tablas faltantes DIFERIDO**: `drizzle-kit push --force` propone cambios destructivos (borrar `__drizzle_migrations`, truncar tablas, cambiar PK). Requiere plan de migracion manual tabla por tabla. Backlog P0 para sprint dedicado.
- **S2 RLS modulos laterales cerrado**: migracion `20260625000001_rls_lateral_modules.sql` habilita RLS en `announcements`, `announcement_read_status`, `conversation_messages`, `conversation_participants`, `message_read_receipts` con policies por tenant/user. Tablas con policy permisiva `allow_authenticated` documentadas en backlog para endurecer (marketplace_*, empleo_*, tickets_*, advertisements, featured_listings, push_subscriptions).
- **S5 mover claves Stripe a Vault DIFERIDO**: `supabase_vault` extension instalada y disponible. `academies.stripe_secret_key` y `academies.stripe_webhook_secret` existen como columnas pero 0 academias tienen datos. Las claves Stripe de Zaltyko (cuenta SaaS) estan en env vars, no en la tabla. Backlog P1 para cuando se implemente Stripe Connect por academia.
- **Validacion**: `pnpm typecheck`, `pnpm lint` y `pnpm validate:rls` (PASS 100% cobertura sobre 63 tablas) limpios. 2 migraciones SQL nuevas aplicadas a Supabase. Sin cambios de UI.

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
