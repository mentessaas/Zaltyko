---
status: active
owner: producto
last_reviewed: 2026-06-23
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../SYSTEMS-ANALYSIS.md
  - ../INCONSISTENCY-AUDIT.md
  - ../06-Roadmap-y-Tareas/Changelog interno.md
  - ../06-Roadmap-y-Tareas/Backlog priorizado.md
---
# Registro de riesgos

> **Última actualización:** 2026-06-23 (post-análisis de 7 Sprints ejecutados)

---

## 🛑 Bloqueantes con Elvis (requieren decisión humana, NO automatizables)

Estos riesgos están **bloqueando trabajo del equipo** y necesitan decisión/elección de Elvis para desatascar. NO son automatizables por Claude Code/Codex/OpenCode.

| # | Riesgo / Bloqueante | Severidad | Estado | Decisión requerida | Impacto si se ignora | Notas |
|---|---------------------|-----------|--------|---------------------|----------------------|-------|
| **B1** | **Rutas legacy `/dashboard/*` vs `/app/[academyId]`** | **P0** | **Bloqueado en Elvis desde 2026-06-22** | Elegir opción A (compat), B (redirect 301), C (alias) o D (migración total). Análisis completo con pros/contras en [[Decisiones]]. | URLs en emails antiguos rompen UX; portal padres no vende con confianza. | Sprint 5 lo dejó como Activo. Sprint 6 no lo tocó. |
| **B2** | **QA portal padres con usuarios `parent`/`athlete` reales** | **P0** | **Bloqueado en Elvis desde 2026-06-22** | Crear 2 cuentas reales (owner + parent) y hacer sesión de prueba humana del flujo completo. | No se puede vender acceso "portal padres" sin validación end-to-end real. | Implementación técnica OK (allowlist + redirect + `/messages`). Solo falta validar UX humano. |
| **B3** | **Validar conversion real del pricing v3.0** | **P0** | **Activo post-lanzamiento** | Coordinar 10 sesiones y revisar métricas Free→Starter/Growth. | No se optimiza la tesis "comunidad masiva + monetización diferida". El pricing ya está publicado, pero falta evidencia de conversión. | Decision activa en [[Pricing]] y [[Decisiones#2026-06-24 - Activar pricing v3.0 como modelo oficial]]. |
| **B4** | **Stripe price IDs reales para decisión v3.0** | **P0** | **Bloqueado en Elvis desde 2026-06-23** | Crear productos Stripe para Starter 19 €/mes y Growth 49 €/mes. Network 99 €/mes queda como CTA comercial hasta existir checkout dedicado. Pegar los `price_***` en env vars + DB. | Mientras haya placeholders, checkout devuelve `STRIPE_NOT_CONFIGURED`. Bloquea venta autoservicio real. | Tarea [[Tarea - Sprint 0 decision v3.0]] bloque 0.3. Sprint 5 ya endureció el guard. |

**Total: 4 bloqueantes con Elvis identificados.** El resto del backlog puede seguir sin necesidad de tu input.

---

## 📊 Tabla maestra de riesgos (viva)

| Riesgo | Severidad | Estado | Mitigacion |
| --- | --- | --- | --- |
| Pricing y limites inconsistentes | Alta | Mitigado 2026-06-24 | Pricing v3.0 aplicado en catálogo/límites/copy: Free 30, Starter 19 €/75, Growth 49 €/200, Network 99 como CTA comercial multi-sede. Pendiente: verificar Stripe price IDs reales por entorno. |
| Promesas publicas no implementadas | Alta | Abierto | Revisar [[Mensajes aprobados]] antes de publicar copy. |
| Features parciales vendidas como completas | Alta | Abierto | Marcar estados en [[Inventario de producto]]. |
| Migraciones/RLS incompletas | Alta | Mitigado 2026-06-23 → 2026-06-24 | 100% cobertura RLS sobre 63 tablas tenant-scoped + 6 tablas criticas creadas en Sprint 6 (`event_registrations`, `event_waitlist`, `event_categories`, `event_payments`, `class_waiting_list`, `athlete_documents`). Job CI `validate-rls` activo bloquea regresiones. |
| 19 tablas TS no existen en DB (era 25, Sprint 6 cerro 6) | Alta | Abierto | Sprint 2 diagnostico con `dump-schema.ts`; `drizzle-kit push --force` es destructivo. Requiere migracion manual tabla por tabla. Bloquea features de: federation (2), mensajes (3), notificaciones (3), roles (2), auxiliares (4), y 5 mas. |
| Policies permisivas en 10 modulos laterales | Alta | Mitigado 2026-06-24 | Sprint 6 reemplazo `allow_authenticated` en marketplace_listings, marketplace_ratings, empleo_listings, empleo_applications, tickets, ticket_responses, ticket_attachments, advertisements, featured_listings, push_subscriptions. Pendiente: validar que ninguna feature dependia de la permisividad original. |
| UX inconsistente en dashboard | Media | Abierto | Auditar flujos P0/P1. |
| Onboarding/trial debil | Media | Mitigado parcialmente | Implementar [[Onboarding y activacion]] + trial 7 dias sin tarjeta de [[Tarea - Sprint 0 decision v3.0]]. |
| SEO/i18n incompleto | Media | Mitigado parcialmente 2026-06-23 | hreflang cluster pages (Sprint 5). i18n extras.ts con 80 keys bilingues (Sprint 6). Pendiente: migrar 30+ dialogos a RHF+Zod, llevar dashboard a next-intl. |
| Rutas legacy `/dashboard` conviviendo con `/app/[academyId]` | Media | Bloqueado en Elvis (B1) | Ver seccion Bloqueantes. |
| WhatsApp vendido mientras feature flag puede estar apagado | Media | Abierto | Alinear [[Mensajes aprobados]] y [[Tarea - Consolidar comunicacion]]. |
| Paginacion de notificaciones posiblemente incorrecta | Media | Cerrado 2026-06-22 | Fix en commit del dia. |
| JWT sin firma valida en middleware super-admin | Alta | Cerrado 2026-06-23 | Verificacion HS256 con `crypto.timingSafeEqual` contra `SUPABASE_JWT_SECRET`. |
| Rate-limit API global potencialmente inactivo | Alta | Cerrado 2026-06-23 | `proxy.ts` consolidado en `middleware.ts`; matcher amplio; rate-limit aplicado a mutaciones API y rutas app/super-admin. |
| SELF_SIGNED_CERT_IN_CHAIN bloquea operacion DB | Alta | Cerrado 2026-06-23 | CA raiz Supabase en `certs/supabase-root-ca.crt`; `scripts/db-migrate.ts` y scripts de diagnostico con SSL fix. |
| Claves Stripe en columnas de tabla | Media | Diferido | `supabase_vault` instalado pero sin uso. 0 academias con `stripe_secret_key` actualmente. Cuando se implemente Connect por academia, mover a Vault. |
| Tests API con flakiness en paralelismo (sport-config 403 vs 409) | Baja | Abierto | 3 fallos intermitentes cuando vitest corre toda la suite con paralelismo. Tests pasan 4/4 cuando se ejecutan aislados. Probable contaminacion de mocks vi.hoisted entre workers. Backlog futuro. |
| Suite `product-go-live-readiness.test.ts` con 2 expects fallando (academyLimit null + "acompañado" ausente) | Alta | **Cerrado 2026-06-23** | Fix en `src/lib/plans/catalog.ts`: Growth `academyLimit: 1` (no null), feature "1 academia operativa" (no "ilimitadas"); Network feature "Multi-sede con onboarding acompañado" como primera. Tests 3/3 PASS. |
| `docs/marketing/zaltyko-pricing.md` legacy con precios viejos (29 €/49 €/149 €) | Media | **Mitigado 2026-06-23** | Bloque de supersede al inicio del doc apuntando a fuentes v3.0. Pendiente: regenerar doc o archivar. |
| Vault Obsidian (`~/obsidian-vault/03-Projects/zaltyko/`) desincronizada con vault del repo | Baja | **Mitigado 2026-06-23** | 7 archivos actualizados (00-README, 01-product, 02-business + supersede, 03-pricing, 04-30-day plan, 05-competitors creado, 06-decisiones creado). Cross-link explicito a vault del repo como fuente canonica. |

---

## 🔄 Cómo mantener este archivo

1. **Después de cada Sprint ejecutado**: añadir fila "Cerrado YYYY-MM-DD" o actualizar estado.
2. **Después de cada decisión de Elvis**: añadir a bloqueantes B# si aplica.
3. **Después de cada fix post-prod**: añadir fila con severidad real observada.
4. **Una vez al mes**: revisar tabla maestra y consolidar filas Cerrado antiguas en archivo historico (`Registro de riesgos - historico.md`).
5. **Cross-link obligatorio**: cualquier cambio aqui debe reflejarse en [[../06-Roadmap-y-Tareas/Backlog priorizado]] (estado de tareas) y viceversa.
