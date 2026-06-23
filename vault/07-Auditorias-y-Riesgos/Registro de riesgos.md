---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../SYSTEMS-ANALYSIS.md
  - ../INCONSISTENCY-AUDIT.md
---
# Registro de riesgos

| Riesgo | Severidad | Estado | Mitigacion |
| --- | --- | --- | --- |
| Pricing y limites inconsistentes | Alta | Abierto | Resolver [[Pricing]] y tests de checkout/limits. |
| Promesas publicas no implementadas | Alta | Abierto | Revisar [[Mensajes aprobados]] antes de publicar copy. |
| Features parciales vendidas como completas | Alta | Abierto | Marcar estados en [[Inventario de producto]]. |
| Migraciones/RLS incompletas | Alta | Mitigado 2026-06-23 | 100% cobertura RLS sobre 63 tablas tenant-scoped (`pnpm validate:rls` PASS). Job CI `validate-rls` activo bloquea regresiones. Sprint 2 atacara drift Drizzle↔SQL y claves Stripe en Vault. |
| UX inconsistente en dashboard | Media | Abierto | Auditar flujos P0/P1. |
| Onboarding/trial debil | Media | Abierto | Implementar [[Onboarding y activacion]]. |
| SEO/i18n incompleto | Media | Abierto | Seguir [[SEO y geo]]. |
| Rutas legacy `/dashboard` conviviendo con `/app/[academyId]` | Media | Abierto | Decidir compatibilidad vs migracion en [[Decisiones]]. |
| WhatsApp vendido mientras feature flag puede estar apagado | Media | Abierto | Alinear [[Mensajes aprobados]] y [[Tarea - Consolidar comunicacion]]. |
| Paginacion de notificaciones posiblemente incorrecta | Media | Abierto | Revisar `notifications/page.tsx` dentro de [[Tarea - Consolidar comunicacion]]. |
| JWT sin firma valida en middleware super-admin | Alta | Cerrado 2026-06-23 | Verificacion HS256 con `crypto.timingSafeEqual` contra `SUPABASE_JWT_SECRET`. |
| Rate-limit API global potencialmente inactivo | Alta | Cerrado 2026-06-23 | `proxy.ts` consolidado en `middleware.ts`; matcher amplio; rate-limit aplicado a mutaciones API y rutas app/super-admin. |
