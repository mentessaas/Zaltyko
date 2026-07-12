---
status: active
owner: producto
last_reviewed: 2026-07-12
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
| Migraciones/RLS incompletas | Alta | Cerrado 2026-07-12 | 100% cobertura de fuentes RLS sobre 63 tablas. `check:migrations` valida 3 migraciones Drizzle + 26 Supabase; la puerta compuesta bloquea regresiones. |
| Raiz del sitio `/` devolvia 404 | Media | Cerrado 2026-06-26 | `middleware.ts` redirige `/` a `/${locale}/gimnasia-artistica` (commit `406c498`). Ver [[Decisiones#2026-06-26 - Routing raiz redirige a primera modalidad]]. |
| Upgrades de dependencias (jspdf 2→4, xlsx por tarball, next 15.5.19, overrides de seguridad) | Media | Cerrado 2026-06-26 | Validado (typecheck limpio, vitest 346/346, build OK) y commiteado en `security/audit-remediation`. Export PDF/Excel compatible (API funcional de jspdf-autotable). Ver [[Changelog interno#2026-06-26 - Upgrades de dependencias (VALIDADO Y COMMITEADO)]]. |
| 25 tablas TS no existen en DB | Alta | Cerrado 2026-07-03 | Migraciones manuales aplicadas y verificadas; DB=ORM salvo `push_tokens`, superseded por `push_subscriptions`. |
| Policies permisivas en modulos laterales | Alta | Cerrado 2026-07-03 | Lotes 1 y 2 sustituyeron escritura `allow_authenticated` y habilitaron RLS en `conversations`. |
| UX inconsistente en dashboard | Media | Abierto | Auditar flujos P0/P1. |
| Onboarding/trial debil | Media | Mitigado, promoción pendiente | Trial 7 días con anti-abuso, lifecycle, avisos y vuelta a Free implementado; falta smoke real tras deploy y continuar mejorando onboarding/aha moments. |
| Drift histórico de Drizzle al generar migraciones | Alta | Abierto | La migración manual de Fase 1 está aplicada, pero `db:generate` detecta diferencias antiguas en tablas de diagnóstico/gastos. Reconciliar sin aceptar cambios destructivos. |
| Doble endpoint webhook Stripe durante rotación | Media | Temporal | Mantener ambos solo hasta validar la entrega firmada de Fase 1; después retirar el endpoint anterior para evitar entregas duplicadas permanentes. La idempotencia reduce impacto, no sustituye la limpieza. |
| SEO/i18n incompleto | Media | Abierto | Seguir [[SEO y geo]]. |
| Rutas legacy `/dashboard` conviviendo con `/app/[academyId]` | Media | Abierto | Decidir compatibilidad vs migracion en [[Decisiones]]. |
| WhatsApp vendido mientras feature flag puede estar apagado | Media | Abierto | Alinear [[Mensajes aprobados]] y [[Tarea - Consolidar comunicacion]]. |
| Paginacion de notificaciones posiblemente incorrecta | Media | Abierto | Revisar `notifications/page.tsx` dentro de [[Tarea - Consolidar comunicacion]]. |
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
