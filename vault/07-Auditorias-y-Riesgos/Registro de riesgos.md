---
status: active
owner: producto
last_reviewed: 2026-07-13
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../SYSTEMS-ANALYSIS.md
  - ../INCONSISTENCY-AUDIT.md
---
# Registro de riesgos

| Riesgo | Severidad | Estado | Mitigacion |
| --- | --- | --- | --- |
| Pricing y limites inconsistentes | Alta | Cerrado en codigo 2026-07-12 | Contrato unico: `free`=Free, `pro`=Starter, `premium`=Growth; `network` solo comercial. Limites, seed, checkout, UI y tests consumen el mismo catalogo. Pendiente comercial: 10 entrevistas. |
| Promesas publicas no implementadas | Alta | Abierto | Revisar [[Mensajes aprobados]] antes de publicar copy. |
| Features parciales vendidas como completas | Alta | Abierto | Marcar estados en [[Inventario de producto]]. |
| Migraciones/RLS incompletas | Alta | Cerrado 2026-07-13 | 100% cobertura de fuentes RLS sobre 64 tablas. `check:migrations` valida 4 migraciones Drizzle + 28 Supabase; la puerta compuesta bloquea regresiones. |
| Raiz del sitio `/` devolvia 404 | Media | Cerrado 2026-06-26 | `middleware.ts` redirige `/` a `/${locale}/gimnasia-artistica` (commit `406c498`). Ver [[Decisiones#2026-06-26 - Routing raiz redirige a primera modalidad]]. |
| Upgrades de dependencias (jspdf 2→4, xlsx por tarball, Next 15.5.19, Vite/Vitest y overrides de seguridad) | Media | Cerrado y revalidado 2026-07-13 | Vite 6.4.3, Vitest/coverage 3.2.6, webpack resuelto 5.108.4 y esbuild >=0.25; Drizzle CLI operativo. `pnpm audit` completo/productivo 0 vulnerabilidades, 422/422 tests y build OK. |
| 25 tablas TS no existen en DB | Alta | Cerrado 2026-07-13 | Migraciones manuales y reconciliación aplicadas; DB=ORM incluido `push_tokens`. Verificación: 113 tablas, sin columnas/índices/FKs semánticas pendientes. |
| Policies permisivas en modulos laterales | Alta | Cerrado 2026-07-03 | Lotes 1 y 2 sustituyeron escritura `allow_authenticated` y habilitaron RLS en `conversations`. |
| UX inconsistente en dashboard | Media | Mitigado 2026-07-13 | Auditoría owner del dashboard, mensajes y preferencias; corregidos pluralización, recomendaciones por deporte y sesiones sin fecha. Continuar auditorías por rol. |
| Onboarding/trial debil | Media | Mitigado y desplegado | Trial 7 días con anti-abuso, lifecycle, avisos y vuelta a Free publicado; smoke de rutas y cron auth correcto. Continúa la mejora de onboarding/aha moments. |
| Drift histórico de Drizzle al generar migraciones | Alta | Cerrado 2026-07-13 | Reconciliados schema, SQL materializado, snapshot y journal con migración no destructiva e inspección manual. Rollback smoke y gate 4+28 pasan. |
| Doble endpoint webhook Stripe durante rotación | Media | Cerrado 2026-07-13 | Stripe quedó con un único endpoint productivo activo y secreto rotado; webhook sin firma falla cerrado. |
| SEO/i18n incompleto | Media | Abierto | Seguir [[SEO y geo]]. |
| Rutas legacy `/dashboard` conviviendo con `/app/[academyId]` | Media | Abierto | Decidir compatibilidad vs migracion en [[Decisiones]]. |
| WhatsApp vendido mientras feature flag puede estar apagado | Media | Mitigado 2026-07-13 | Feature flag apagada, CTA retirado del portal familiar y canal interno priorizado. Revisar mensajes comerciales si vuelve a activarse. |
| Paginacion de notificaciones posiblemente incorrecta | Media | Cerrado 2026-07-10 | Corregido consumo del envelope y paginación; pruebas de paneles de comunicación pasan. |
| QA parent/athlete sin credenciales reales durante Fase 2 | Media | Validación humana pendiente | Contratos de rol, scoping y enlaces pasan; owner redirige correctamente fuera del portal familiar. Ejecutar sesión real parent/athlete cuando exista cuenta de prueba vinculada. |
| JWT sin firma valida en middleware super-admin | Alta | Cerrado 2026-06-23 | Verificacion HS256 con `crypto.timingSafeEqual` contra `SUPABASE_JWT_SECRET`. |
| Rate-limit API bloqueaba todas las mutaciones/rutas app | Critica | Cerrado 2026-07-12 | Middleware ahora devuelve 429 solo cuando `success=false`, continua con headers cuando permite y tiene 4 tests de regresion. |
| Service worker cacheaba APIs/HTML privado y reproducia mutaciones | Critica | Cerrado 2026-07-12 | SW v2 cachea solo assets estaticos; APIs/HTML van a red, cola mutante y background sync deshabilitados. |
| Formulario de contacto podia enviar por GET antes de hidratar | Alta (privacidad) | Cerrado 2026-07-12 | Submit permanece deshabilitado hasta hidratar; E2E publico 6/6 confirma POST interceptado y feedback. |
| Warnings de build Sentry y swagger-jsdoc | Baja | Abierto | Migrar opciones Sentry deprecadas y aislar generacion Swagger para eliminar dependencia dinamica. |
| Bundle de dashboard 621 kB First Load JS | Media | Abierto | Definir presupuesto y dividir graficas/widgets pesados sin redisenar el flujo. |
| SELF_SIGNED_CERT_IN_CHAIN bloquea operacion DB | Alta | Cerrado 2026-06-23 | CA raiz Supabase en `certs/supabase-root-ca.crt`; `scripts/db-migrate.ts` y scripts de diagnostico con SSL fix. |
| Claves Stripe en columnas de tabla | Media | Diferido | `supabase_vault` instalado pero sin uso. 0 academias con `stripe_secret_key` actualmente. Cuando se implemente Connect por academia, mover a Vault. |
| Escalada de permisos cross-tenant en `permissions-service.ts` | Critica | Cerrado 2026-07-03 | Cualquier perfil con rol global `owner` (default de signup para todos) obtenia `getAllPermissions()` sobre CUALQUIER academia sin verificar propiedad. Corregido: ahora exige `academies.ownerId === profile.id` o membership `owner` explicita. Detectado via auditoria externa (Codex) verificada contra prod antes de aplicar el fix. Ver [[Changelog interno#2026-07-07 - Sesion super-admin CRUD + fixes de settings/env]]. |
| Formularios que envian `null` en campos opcionales rompen validacion Zod | Media | Cerrado 2026-07-07 | `PATCH /api/academies/[id]/settings` devolvia 400 en cada guardado porque el form cliente envia `null` (no `undefined`) y el schema solo tenia `.optional()`. Patron a vigilar en otros formularios: usar `.nullable()` cuando el cliente puede enviar `null` explicito. |
