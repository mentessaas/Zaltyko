---
status: active
owner: producto
last_reviewed: 2026-07-13
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../ROADMAP.md
  - ../docs/GO_LIVE_REVIEW_2026-04.md
  - ../AGENTS.md
---
# Estado actual de Zaltyko

## Lectura rápida

Zaltyko está en **hardening avanzado como producto real**, con Fases 1, 2 y 3 desplegadas y la plataforma de medición de Fase 4 publicada técnicamente en producción. El 2026-07-13 quedó publicado el trial Starter real de 7 días, permisos personalizados operativos, checkout/portal owner-only y procesamiento Stripe idempotente y ordenado. También se desplegaron el portal familiar limitado, la comunicación interna contextual y el cockpit de `clase de hoy`. Fase 4 añade captura first-party del funnel, persistencia de leads y un cockpit Super Admin para registrar evidencia comercial; la validación humana sigue honestamente en **0/10 entrevistas**. La cobertura RLS es 100% sobre 65 tablas tenant-scoped y la puerta completa pasa 279 APIs, 431 pruebas y build de 216 páginas.

- Fase 3 fue integrada en `main` mediante PR #27 y conserva explícitamente `bd2bb95a`, el trabajo paralelo de nomenclatura federativa. Fase 4 se integró mediante PR #28 en `b97d7a81`, sin revertir ese bloque.
- Supabase usa PostgreSQL 17.6. El catálogo `rfeg-2026-v2` quedó sincronizado el 2026-07-12 mediante un comando acotado e idempotente; un segundo dry-run confirmó cero diferencias. No se ejecutó el seed global ni una migración de schema.
- Las migraciones de Fases 1-4 están aplicadas y verificadas. `20260713170000_phase4_commercial_validation.sql` crea `growth_events` y `commercial_interviews`, endurece las policies de `leads` y no introduce borrados. El cierre detectó y reconcilió de forma no destructiva el constraint histórico `coaches_slug_unique` mediante `20260713173000_reconcile_coaches_slug_unique.sql`; 3/3 filas tenían slug nulo y no existían duplicados. El inventario actual es 6 migraciones Drizzle + 31 Supabase, 115 tablas verificadas y RLS 65/65.
- Fase 1 pasó el gate completo y fue desplegada a producción. El endpoint Stripe activo fue rotado a una única versión; pricing responde 200, trial/cron sin auth 401 y webhook sin firma 400 con `SIGNATURE_VERIFICATION_FAILED`.
- Fase 2 fue desplegada desde `47228ee5` en `dpl_AYKBXmfi88CK2MeqWvZMqKjo3Bee` (`READY`, alias `zaltyko.com`). Smokes: pricing 200, panel privado 307, APIs privadas 401 y webhook sin firma 400. `pnpm audit` completo y productivo: 0 vulnerabilidades. La sesión parent real sigue siendo validación humana, no deuda de implementación.
- Fase 3 fue desplegada desde el árbol integrado `0a023880` en `dpl_68XGuYVFtQnrLbjWjhv17NtMpxH8` (`READY`, alias `zaltyko.com`). El recorrido real de coach guardó 5 asistencias, una evaluación ligada a sesión/evaluador y un aviso interno; después se eliminaron y verificaron a cero todas las fixtures. Playwright autenticado pasa 2/2, incluido WCAG 2.2 AA y móvil a 375 px sin overflow.
- Baseline comercial de Fase 4: 2 academias, 0 leads, 0 eventos de growth, 0 trials, 0 suscripciones respaldadas por un `stripe_subscription_id` y 0/10 entrevistas. No se fabricaron fixtures comerciales. Stripe live sí está verificado: Starter 19 EUR/mes y Growth 49 EUR/mes activos; Network continúa sales-assisted.
- Despliegue de Fase 4: `dpl_BU9hYAp6KjwSxVkjREL85X5n2ZPJ` está `READY` desde `main` (`b97d7a81`) en `https://zaltyko.com` y `https://www.zaltyko.com`. Smoke externo read-only: `/`, `/pricing` y `/contact?type=network` responden 200; `/super-admin/growth` responde 307 a `/auth/login`. El alias interno de Vercel conserva SSO, sin afectar al dominio público.
- Historial de ejecución: [[Changelog interno]] y [[Decisiones#2026-06-24 - Resumen de sprints 0-7 + auditoria + CI fix]].

## Lo que tenemos

| Área | Estado | Nota |
| --- | --- | --- |
| Multi-tenant auth | Activo | `withTenant` es obligatorio en APIs. |
| Atletas | Avanzado | Perfiles, tutores, historial, import/export y vistas principales. |
| Clases y grupos | Avanzado | Calendario, sesiones, grupos, asistencia y capacidad. |
| Billing | Avanzado / RC Fase 1 | Trial 7 días sin tarjeta, Checkout/Portal owner-only, cargos, descuentos, becas, recibos, webhooks idempotentes y reportes parciales. |
| Eventos | Avanzado | CRUD, inscripciones, waitlist, archivos y páginas públicas. |
| Evaluaciones | Avanzado / Fase 3 desplegada | Evaluaciones, historial y progreso; el registro rápido queda vinculado a sesión, modalidad, aparato y evaluador autenticado. |
| Asistencia | Avanzado / Fase 3 desplegada | Página dedicada, API, reportes y pase de lista operativo desde la clase con scope de coach verificado. |
| Comunicación | Avanzado / Fase 2 desplegada | Mensajes internos, notificaciones, preferencias y aviso contextual por sesión; WhatsApp oculto como canal secundario. |
| IA | Parcial | Endpoints e ideas de widgets; falta integración de valor visible. |
| SEO/geografía | Parcial | Clusters y rutas avanzadas; faltan traducciones/contenido completo. |
| Marketplace/empleo | Parcial/avanzado | Rutas públicas y APIs existen; revisar consistencia comercial. |
| Growth comercial | RC Fase 4 / evidencia activa | Funnel first-party, leads persistentes y entrevistas estructuradas operativos; baseline real 0/10, sin objetivos de conversión hasta acumular denominadores. |

## Lo que ya está cerrado (no reabrir sin motivo)

- Monetización/checkout: downgrade Stripe corregido, toggle anual bloqueado hasta price real, planes alineados a v1 (1 academia).
- Seguridad: RLS habilitada en todas las tablas tenant (90 en prod), JWT firma HS256, rate-limit consolidado, secretos Stripe no expuestos, idempotency keys y mensajes de error genericos. **Matiz clave (auditado 2026-07-03):** la conexion de la app es rol `postgres` con `BYPASSRLS`, asi que la RLS es **defensa en profundidad para acceso directo del cliente Supabase**, NO red de seguridad server-side. El aislamiento en 272 rutas API depende de wrappers/guards. El inventario estricto 2026-07-12 clasifica las 272 rutas y deja 0 mutaciones con auth desconocida; `admin` global ya no puede resolver tenants sin ownership/membership.
- Flujos core (evaluaciones, asistencia, reportes, comunicación, billing) validados en QA P1 sandbox 5/5.
- Puerta de release local verde: `pnpm verify:production` pasa 279 APIs, RLS 65/65, 6+31 migraciones, lint, typecheck, 431 tests y build de 216 páginas. Pricing, contacto y Growth pasan axe WCAG 2.2 AA sin violaciones; móvil 375 px no desborda.
- **Escalada de permisos cross-tenant cerrada 2026-07-03** (`permissions-service.ts`): ver [[Registro de riesgos]] y [[Changelog interno#2026-07-07 - Sesion super-admin CRUD + fixes de settings/env (5 PRs mergeados a main)]]. No revertir sin re-auditar.
- **Datos de test purgados de producción 2026-07-07**: solo quedan las 2 cuentas reales y la academia real. No hay huérfanos.
- **CRUD completo de super-admin 2026-07-07**: crear academia+dueño, crear/eliminar usuarios, editar todos los campos de academia (nombre/tipo/país/región/ciudad/plan/suspensión), todo desde `/super-admin`.
- **Bugs de guardado cerrados 2026-07-07**: `PATCH /api/academies/[id]/settings` (400 por `null` no aceptado en Zod), refresh de detalle de academia mostrando "Sin nombre/Sin plan" tras guardar (respuesta `{data}` sin desempaquetar), warning falso de env corriendo en el navegador.

## Bloqueadores reales / lo que sigue

Pendientes vigentes a 2026-06-26 (orden sugerido en [[Roadmap maestro#Proximos pasos sugeridos (continuidad para agentes)]]):

1. **Decisión humana — legacy `/dashboard/*`** (Elvis). Opción A recomendada y analizada; bloquea Sprint 7D. Ver [[Decisiones]].
2. ~~**Tablas TS faltantes en DB**~~ **RESUELTO**. La DB coincide con el ORM, incluido `push_tokens`; la verificación del 2026-07-13 confirma 113 tablas y ausencia de columnas, índices únicos o FKs semánticas pendientes. Nota: RLS es defensa en profundidad porque la conexión de la app es rol `postgres` con `BYPASSRLS`.
3. ~~**Policies permisivas** `allow_authenticated` en marketplace/empleo/tickets/anuncios/push~~ **RESUELTO**. Lote 1 (`20260625000002`) cubrió marketplace/empleo/tickets/anuncios/push. Lote 2 (`20260703000000`, aplicado a prod 2026-07-03) cerró las 5 tablas restantes con escritura permisiva (descuentos + templates globales) y habilitó RLS en `conversations`. Verificado read-only: 0 policies de escritura `allow_authenticated`. Script reutilizable: `scripts/verify-permissive-policies.ts`.
4. **Deuda de auditoria**: items 1.2 (encriptar Stripe), 2.3 (cross-check invoice), 2.5 (rate-limit por tenantId), 2.6 (indice memberships), webhooks edge, rendimiento del dashboard, warnings Sentry/Swagger, i18n y a11y. El item 2.2 quedo cerrado el 2026-07-12 mediante resolucion de tenant por ownership/membership.
5. ~~**Upgrades de dependencias sin commitear**~~ **RESUELTO**. Dependencias y overrides están commiteados, auditados con 0 vulnerabilidades y revalidados por el gate integrado.
6. **Validaciones humanas**: Fase 4 permanece abierta en 0/10 entrevistas reales de pricing freemium. También sigue pendiente QA del portal padres/atletas + solicitudes de vínculo con usuarios reales. El código y los contratos automatizados ya están cerrados; no iniciar Fase 5 hasta completar y sintetizar la muestra comercial.

## Prioridades actuales

1. P0: cerrar decisión legacy `/dashboard/*`. Migraciones y reconciliación DB/ORM están completadas.
2. P0: aplicar deuda de auditoria de seguridad restante (2.3/2.5). 2.2 y policies permisivas ya estan resueltas.
3. P1: QA con usuarios reales (portal padres, solicitudes de vínculo) y 10 entrevistas de pricing.
4. P1: medir Fase 4 comercial y preparar Fase 5 solo con evidencia de validación.
5. P2: completar i18n del producto autenticado, refactors de componentes grandes y a11y.

## Dónde mirar

- Producto: [[Inventario de producto]]
- Tecnología: [[Arquitectura]]
- Negocio: [[Modelo de negocio]] y [[Pricing]]
- Marketing: [[Mensajes aprobados]]
- Roadmap: [[Roadmap maestro]] y [[Backlog priorizado]]
- Riesgos: [[Registro de riesgos]]
