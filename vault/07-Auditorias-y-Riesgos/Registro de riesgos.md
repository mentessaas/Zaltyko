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
| Migraciones/RLS incompletas | Alta | Mitigado 2026-06-23 | 100% cobertura RLS sobre 63 tablas tenant-scoped (`pnpm validate:rls` PASS). Job CI `validate-rls` activo bloquea regresiones. |
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
