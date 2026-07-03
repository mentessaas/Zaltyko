---
status: active
owner: producto
last_reviewed: 2026-06-26
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../ROADMAP.md
  - ../docs/GO_LIVE_REVIEW_2026-04.md
  - ../AGENTS.md
---
# Estado actual de Zaltyko

## Lectura rápida

Zaltyko está en **hardening avanzado**. Se ejecutaron los sprints 0-7, una auditoría completa de seguridad y calidad (PR #8) y un fix de CI. El deploy de Vercel está verde (207 páginas pre-renderizadas), la cobertura RLS es 100% sobre 62 tablas y el QA P1 pasa 5/5 en sandbox. El core operativo existe y está endurecido; lo que queda son **decisiones humanas, QA con usuarios reales y deuda técnica acotada** (ver "Bloqueadores reales / lo que sigue").

- Rama de trabajo actual: `security/audit-remediation` (HEAD `406c498`).
- Historial de ejecución: [[Changelog interno]] y [[Decisiones#2026-06-24 - Resumen de sprints 0-7 + auditoria + CI fix]].

## Lo que tenemos

| Área | Estado | Nota |
| --- | --- | --- |
| Multi-tenant auth | Activo | `withTenant` es obligatorio en APIs. |
| Atletas | Avanzado | Perfiles, tutores, historial, import/export y vistas principales. |
| Clases y grupos | Avanzado | Calendario, sesiones, grupos, asistencia y capacidad. |
| Billing | Avanzado | Cargos, descuentos, becas, recibos, Stripe y reportes parciales. |
| Eventos | Avanzado | CRUD, inscripciones, waitlist, archivos y páginas públicas. |
| Evaluaciones | Parcial/avanzado | Hay rutas de evaluaciones, evaluate, historial y progreso por atleta; falta validar flujo end-to-end. |
| Asistencia | Parcial/avanzado | Existe pagina dedicada `/app/[academyId]/attendance`, API y reportes; falta QA end-to-end. |
| Comunicación | Parcial/avanzado | Hay mensajes, notificaciones, WhatsApp, templates e historial; falta confirmar centro unificado como experiencia final. |
| IA | Parcial | Endpoints e ideas de widgets; falta integración de valor visible. |
| SEO/geografía | Parcial | Clusters y rutas avanzadas; faltan traducciones/contenido completo. |
| Marketplace/empleo | Parcial/avanzado | Rutas públicas y APIs existen; revisar consistencia comercial. |

## Lo que ya está cerrado (no reabrir sin motivo)

- Monetización/checkout: downgrade Stripe corregido, toggle anual bloqueado hasta price real, planes alineados a v1 (1 academia).
- Seguridad: RLS habilitada en todas las tablas tenant (90 en prod), JWT firma HS256, rate-limit consolidado, secretos Stripe no expuestos, idempotency keys, mensajes de error genéricos. **Matiz clave (auditado 2026-07-03):** la conexión de la app es rol `postgres` con `BYPASSRLS`, así que la RLS es **defensa en profundidad para acceso directo del cliente Supabase** (anon key: tickets, realtime, storage, acciones públicas), NO red de seguridad server-side. El aislamiento en las 265 rutas API depende de los wrappers de auth (`withTenant`/`withSuperAdmin`/`withBearerTenant`/sesión+`verifyAcademyAccessForProfile`/firma/cron). Auditoría de las 71 rutas sin `withTenant`: **0 fugas/IDOR**. Ver `CLAUDE.md#Security` corregido.
- Flujos core (evaluaciones, asistencia, reportes, comunicación, billing) validados en QA P1 sandbox 5/5.
- CI verde: `lint`, `typecheck`, `build`, `validate:rls`, `check:migrations` pasan.

## Bloqueadores reales / lo que sigue

Pendientes vigentes a 2026-06-26 (orden sugerido en [[Roadmap maestro#Proximos pasos sugeridos (continuidad para agentes)]]):

1. **Decisión humana — legacy `/dashboard/*`** (Elvis). Opción A recomendada y analizada; bloquea Sprint 7D. Ver [[Decisiones]].
2. ~~**Tablas TS faltantes en DB**~~ **RESUELTO** (verificado 2026-07-03 contra prod). La DB ahora coincide **1:1 con el ORM**: se crearon y aplicaron a prod (transacción, verificado con RLS+policies) las 21 tablas que faltaban, en 4 migraciones: `0006` corregida (`class_exceptions`: la FK apuntaba a `academies(tenant_id)` no única → nunca se aplicó; ahora `academies(id)`), `20260703000001` (4 tablas mensajería), `20260703000002` (`message_history`), `20260703000003` (15 laterales: evaluaciones avanzadas, `competition_results`, `federative_licenses`, `leads`, `academy_roles`/`role_members`, `scheduled_reports`, `leak_action_history`, sub-tablas `template_*`). **Los 2 crons rotos quedan arreglados** y todos los módulos tienen su tabla. Única ORM no materializada: `push_tokens` (muerta, superseded por `push_subscriptions`). Nota: RLS es defensa en profundidad porque la conexión de la app es rol `postgres` con `BYPASSRLS`.
3. ~~**Policies permisivas** `allow_authenticated` en marketplace/empleo/tickets/anuncios/push~~ **RESUELTO**. Lote 1 (`20260625000002`) cubrió marketplace/empleo/tickets/anuncios/push. Lote 2 (`20260703000000`, aplicado a prod 2026-07-03) cerró las 5 tablas restantes con escritura permisiva (descuentos + templates globales) y habilitó RLS en `conversations`. Verificado read-only: 0 policies de escritura `allow_authenticated`. Script reutilizable: `scripts/verify-permissive-policies.ts`.
4. **Deuda de auditoría**: items 1.2 (encriptar Stripe), 2.2 (`verifyAcademyBelongsToTenant`), 2.3 (cross-check invoice), 2.5 (rate-limit por tenantId), 2.6 (índice memberships), refactors de componentes >700 líneas, i18n del producto autenticado (~10%), a11y. Ver [[Backlog priorizado]].
5. **Upgrades de dependencias sin commitear** (jspdf 2→4, xlsx por tarball, next 15.5.19, overrides de seguridad). Validar export PDF/Excel antes de commitear.
6. **Validaciones humanas**: 10 entrevistas de pricing freemium y QA del portal padres/atletas + solicitudes de vínculo con usuarios reales.

## Prioridades actuales

1. P0: cerrar decisión legacy `/dashboard/*`. Migración de tablas faltantes COMPLETADA: DB = ORM 1:1 (21 tablas aplicadas a prod, crons + todos los módulos con su tabla).
2. P0: aplicar deuda de auditoría de seguridad restante (2.2/2.3/2.5). Policies permisivas ya resueltas (lote 1 + lote 2).
3. P1: validar + commitear upgrades de dependencias (riesgo en export PDF/Excel).
4. P1: QA con usuarios reales (portal padres, solicitudes de vínculo) y 10 entrevistas de pricing.
5. P2: completar i18n del producto autenticado, refactors de componentes grandes y a11y.

## Dónde mirar

- Producto: [[Inventario de producto]]
- Tecnología: [[Arquitectura]]
- Negocio: [[Modelo de negocio]] y [[Pricing]]
- Marketing: [[Mensajes aprobados]]
- Roadmap: [[Roadmap maestro]] y [[Backlog priorizado]]
- Riesgos: [[Registro de riesgos]]
