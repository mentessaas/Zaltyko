---
status: active
owner: producto
last_reviewed: 2026-07-06
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../SYSTEMS-ANALYSIS.md
  - ../INCONSISTENCY-AUDIT.md
---
# Registro de riesgos

| Riesgo | Severidad | Estado | Mitigacion |
| --- | --- | --- | --- |
| Toolchain local roto tras upgrades (`lint`, `build`, `dev`) | Alta | Cerrado 2026-07-06 | Fijados ESLint legacy/dependencias, alias/transpile para `date-fns-tz`, shim controlado de `next/router` para Sentry y sustitucion de Axios en LemonSqueezy. Evidencia: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test -- --run` PASS; dev smoke de rutas super-admin devuelve `307 /auth/login` sin 500. |
| Hard-delete de academias desde super-admin | Alta | Cerrado 2026-07-06 | `DELETE /api/super-admin/academies/[academyId]` devuelve 405 `ACADEMY_DELETE_DISABLED` y registra `academy.delete_blocked`; UI retira la accion de eliminar y mantiene suspension/reactivacion. No hay flujo estandar para borrar academias reales. |
| Promocion a `super_admin` sin confirmacion backend dedicada | Alta | Cerrado 2026-07-06 | PATCH de usuario valida rol con enum Zod, exige `confirmSuperAdminPromotion: true` al promover y registra `user.role_changed` con rol anterior/nuevo. Cubierto por tests API. |
| Pricing y limites inconsistentes | Alta | Mitigado 2026-06-23 | Pricing alineado a v1 (1 academia), toggle anual bloqueado hasta price real, downgrade Stripe corregido. Pendiente: validar hipotesis freemium con 10 entrevistas ([[Pricing]]). |
| Promesas publicas no implementadas | Alta | Abierto | Revisar [[Mensajes aprobados]] antes de publicar copy. |
| Features parciales vendidas como completas | Alta | Abierto | Marcar estados en [[Inventario de producto]]. |
| Migraciones/RLS incompletas | Alta | Cerrado 2026-06-26 | 100% cobertura RLS sobre 62 tablas tenant-scoped (`pnpm validate:rls` PASS). Ultima brecha (`academy/athlete/coach_sport_configs`) cerrada en commit `406c498` con `20260626000000_rls_sport_configs.sql`. Jobs CI `validate-rls` y `check:migrations` bloquean regresiones. |
| Raiz del sitio `/` devolvia 404 | Media | Cerrado 2026-06-26 | `middleware.ts` redirige `/` a `/${locale}/gimnasia-artistica` (commit `406c498`). Ver [[Decisiones#2026-06-26 - Routing raiz redirige a primera modalidad]]. |
| Upgrades de dependencias (jspdf 2→4, xlsx por tarball, next 15.5.19, overrides de seguridad) | Media | Cerrado 2026-06-26 | Validado (typecheck limpio, vitest 346/346, build OK) y commiteado en `security/audit-remediation`. Export PDF/Excel compatible (API funcional de jspdf-autotable). Ver [[Changelog interno#2026-06-26 - Upgrades de dependencias (VALIDADO Y COMMITEADO)]]. |
| 25 tablas TS no existen en DB | Alta | Abierto | Sprint 2 diagnostico con `dump-schema.ts`; `drizzle-kit push --force` es destructivo. Requiere migracion manual tabla por tabla. Bloquea features de eventos (4 tablas), clases (2), atletas (1), federacion (2), marketing (1), mensajes (3), notificaciones (3), roles (2), auxiliares (4). |
| Policies permisivas en modulos laterales | Alta | Abierto | `allow_authenticated` permite a cualquier usuario ver/modificar datos de marketplace, empleo, tickets, anuncios, push subscriptions. Requiere migracion con policies por tenant/user. |
| UX inconsistente en dashboard | Media | Abierto | Auditar flujos P0/P1. |
| Onboarding/trial debil | Media | Abierto | Implementar [[Onboarding y activacion]]. |
| SEO/i18n incompleto | Media | Abierto | Seguir [[SEO y geo]]. |
| Rutas legacy `/dashboard` conviviendo con `/app/[academyId]` | Media | Abierto | Decidir compatibilidad vs migracion en [[Decisiones]]. |
| WhatsApp vendido mientras feature flag puede estar apagado | Media | Abierto | Alinear [[Mensajes aprobados]] y [[Tarea - Consolidar comunicacion]]. |
| Paginacion de notificaciones posiblemente incorrecta | Media | Abierto | Revisar `notifications/page.tsx` dentro de [[Tarea - Consolidar comunicacion]]. |
| JWT sin firma valida en middleware super-admin | Alta | Cerrado 2026-06-23 | Verificacion HS256 con `crypto.timingSafeEqual` contra `SUPABASE_JWT_SECRET`. |
| Rate-limit API global potencialmente inactivo | Alta | Cerrado 2026-06-23 | `proxy.ts` consolidado en `middleware.ts`; matcher amplio; rate-limit aplicado a mutaciones API y rutas app/super-admin. |
| SELF_SIGNED_CERT_IN_CHAIN bloquea operacion DB | Alta | Cerrado 2026-06-23 | CA raiz Supabase en `certs/supabase-root-ca.crt`; `scripts/db-migrate.ts` y scripts de diagnostico con SSL fix. |
| Claves Stripe en columnas de tabla | Media | Diferido | `supabase_vault` instalado pero sin uso. 0 academias con `stripe_secret_key` actualmente. Cuando se implemente Connect por academia, mover a Vault. |
