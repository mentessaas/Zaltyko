# Estado actual · GymnaSaaS (08 nov 2025)

## 1. Fotografía del repositorio

- **Stack**: Next.js 14 (App Router), TypeScript, Tailwind, Drizzle ORM con PostgreSQL/Supabase, Vitest.
- **Estructura principal**:
  - `src/app`: páginas públicas (landing, pricing, legales), flujos de autenticación/onboarding y dashboards básicos; API routes REST para academias, atletas, clases, clases, evaluaciones, facturación, etc.
  - `src/db`: esquemas Drizzle para entidades multi-tenant (`tenant_id` en casi todas las tablas), enums de roles y estatus de suscripción.
  - `supabase/rls.sql`: definición de funciones helper, activación de RLS y políticas por tabla (mezcla de dos versiones, requiere depuración).
  - `docs/database.md`: documentación parcial del modelo actual.
  - `public`: assets del template original (ShipFree) aún presentes.
- **Autenticación**: formularios Next.js que consumen `supabase.auth`. Roles vigentes (`super_admin | admin | owner | coach | athlete`). Falta rol/experiencia específica para padres.
- **Facturación**: código base para Stripe (checkout, webhook, portal) y LemonSqueezy, con enforcement de límites vía `assertWithinPlanLimits`. Aún sin UI de gestión de planes ni Stripe Connect.
- **Testing**: Vitest solo cubre límites/tenancy legacy; los nuevos endpoints carecen de pruebas automatizadas.

## 2. `src/app` (UI + API)

| Zona | Observaciones |
| --- | --- |
| Landing (`src/app/(site)` y `src/app/page.tsx`) | Ya adaptada a narrativa GymnaSaaS, pero sigue usando assets genéricos. |
| Onboarding (`src/app/onboarding/page.tsx`) | Wizard básico orientado a demo; no incluye pasos mágicos ni gamificación solicitada. |
| Dashboards (`src/app/app/[academyId]`, `src/app/dashboard`) | Vistas placeholder, sin widgets ni gráficas avanzadas. |
| API Routes | Endpoints para usuarios, atletas (filtros + import/export), coaches, clases y sesiones (GET/POST/PUT). Falta documentación pública, borrados y rate limiting. |
| Auth (`src/app/auth`) | Formularios Supabase básicos, sin login social, sin flujo para padres. |
| Legales (`privacy-policy`, `tos`) | Actualizados al contexto GymnaSaaS. |
| Otros | No existe perfil público SEO por academia ni feed social/comunidad. |

## 3. `src/db` (Drizzle ORM)

- **Tablas disponibles**: academies, profiles, memberships, subscriptions, plans, athletes, coaches, classes, events, audit_logs, class_sessions, attendance_records, guardians, guardian_athletes, family_contacts, skill_catalog, athlete_assessments, assessment_scores, coach_notes, class_coach_assignments.
- **Limitaciones actuales**:
  - Falta rol `parent` oficial y modelado de logros, rankings, tareas/metas, marketplace, comunidad, referidos e IA.
  - `plans` solo almacena código/limites; carece de precios multi-moneda, beneficios o jerarquías.
  - No existe historial financiero (pagos individuales, becas, descuentos).
  - No hay auditoría detallada (solo tabla `audit_logs` sin uso activo).

## 4. `supabase/rls.sql`

- Contiene **dos bloques superpuestos** de políticas (una versión vieja con rol `super_admin` y otra actual). Se requiere consolidar para evitar conflictos.
- Las funciones helper (`get_current_profile`, `get_current_tenant`, `is_admin`) están duplicadas.
- Políticas cubren tablas principales pero no contemplan roles de padres ni lectura pública (p. ej. landing SEO).
- No hay migraciones automatizadas: `drizzle/` incluye 3 scripts, pero el roadmap exige un backlog más amplio.

## 5. Brechas frente al roadmap

Leyenda: ✅ listo · ◑ parcial o prototipo · ❌ ausente

| # | Requisito | Estado | Comentarios |
| --- | --- | --- | --- |
| 1 | Gestión de usuarios/roles (Super Admin, Dueño, Entrenador, Atleta, Padre) | ◑ | Panel multi-tenant, invitaciones y selector de academia activos; pendiente rol “padre” y permisos avanzados. |
| 2 | Gestión de atletas (CRUD, historial, filtros, import/export) | ◑ | Listado filtrable, ficha con tutores e import/export CSV. Falta historial/progreso detallado y reporting. |
| 3 | Gestión de entrenadores (asignación, perfiles públicos) | ◑ | Panel de coaches con asignaciones y control de asistencia. Falta biografía/perfil público. |
| 4 | Gestión de clases/horarios (calendario, alertas) | ◑ | CRUD + API GET/PUT y calendario semanal/mensual. Pendiente recurrencia automática y alertas (cupos, cancelaciones). |
| 5 | Facturación y pagos (Stripe, recibos, becas) | ◑ | Stripe checkout/portal presentes; falta Stripe Connect, recibos personalizados, descuentos/becas en DB y UI. |
| 6 | Logros gamificados (Código FIG, badges, PDF) | ❌ | No existe modelado ni UI. |
| 7 | Ranking de academias y atletas | ❌ | No hay tablas ni cálculos de ranking/leaderboards. |
| 8 | Sistema de tareas y metas + IA | ❌ | No hay estructura para tareas asignadas o sugerencias automáticas. |
| 9 | Mapa de eventos y competencias | ◑ | Tabla `events` y endpoint básico; sin geolocalización, invitaciones, ni UI de mapa. |
| 10 | Marketing automático (plantillas, disparadores, Brevo/n8n) | ❌ | Solo configuración `config.mailgun`; no hay workflows ni integraciones. |
| 11 | Marketplace interno + Stripe Connect | ❌ | No hay entidades para productos/ventas ni split payments. |
| 12 | Afiliados / referidos | ❌ | Sin tablas ni lógica de tracking. |
| 13 | Perfil público SEO por academia | ❌ | No existe ruta pública con datos de academias. |
| 14 | IA de retención (alertas de riesgo) | ❌ | Sin pipelines ni datasets preparados. |
| 15 | IA de productividad para entrenadores | ❌ | Sin motor de recomendaciones. |
| 16 | Analítica avanzada (BI, exportables) | ◑ | Dashboard básico; falta orquestación de métricas, exportables y visualizaciones. |
| 17 | Feed social interno | ❌ | No hay modelo ni UI social. |
| 18 | Comunidad global GymnaSaaS | ❌ | Inexistente. |
| 19 | Panel de Súper Admin (impersonar, métricas globales) | ❌ | No hay vista ni herramientas de soporte central. |
| 20 | Gestión de planes/suscripciones UI | ◑ | Lógica de límites presente; falta panel de administración de planes y opciones de ciclo de facturación. |
| 21 | Diseño UX/UI estilo Notion+Apple+Duolingo | ◑ | Landing renovada, pero el resto mantiene estilo boilerplate. |
| 22 | Onboarding mágico | ◑ | Onboarding actual guía demo, pero sin wizard completo ni gamificación final. |
| 23 | Gamificación del uso (niveles, créditos) | ❌ | No hay mecanismos. |
| 24 | Integraciones externas (Calendar, WhatsApp, Zapier, Brevo) | ❌ | No hay conectores activos; solo utilidades Stripe/LeMonSqueezy. |
| 25 | Multiidioma (ES/EN/PR/IT) | ❌ | Solo español; sin i18n config. |
| 26 | API pública + webhooks | ◑ | API interna via Next.js; carece de autenticación externa, rate limiting y documentación pública. |

## 6. Recomendaciones inmediatas

1. **Depurar RLS**: consolidar `supabase/rls.sql`, eliminar duplicados y contemplar rol `parent`.
2. **Pruebas automatizadas**: agregar Vitest para nuevos endpoints (usuarios, atletas, coaches, clases, sesiones, asistencia).
3. **Guía y seeds**: documentar uso de `scripts/seed.ts` y publicar guía interna de soporte.
4. **UX pendiente**: navegación del calendario, avisos sin clases en panel de coaches y plantilla CSV para importador.
5. **Documentación viva**: mantener `docs/phase-1-*` actualizados y registrar cambios en `docs/changelog.md`.

El producto cubre el núcleo operativo (Sprints 1-3). Sprint 4 puede enfocarse en facturación, analítica y endurecer QA/Docs.

