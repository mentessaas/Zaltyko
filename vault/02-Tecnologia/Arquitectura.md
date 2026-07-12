---
status: active
owner: tech
last_reviewed: 2026-07-12
source:
  - ../README.md
  - ../AGENTS.md
  - ../docs/architecture.md
  - ../package.json
---
# Arquitectura

## Stack

- Next.js 15.5.19 App Router.
- React 18.3.x.
- Supabase PostgreSQL con RLS (cobertura de fuentes 100% / 64 tablas tenant-scoped).
- Drizzle ORM 0.45.x (migraciones versionadas en `drizzle/`).
- NextAuth.js v5.
- Stripe.
- Tailwind CSS + shadcn/ui.
- Vercel.

> pnpm moderno se configura desde `pnpm-workspace.yaml`: overrides, allowBuilds y onlyBuiltDependencies. Ver [[Runbook desarrollo#pnpm]].

## Estructura principal

| Ruta | Responsabilidad |
| --- | --- |
| `src/app/app/[academyId]/` | Dashboard protegido por academia. |
| `src/app/api/` | API routes. Deben usar `withTenant` salvo endpoints publicos o admin justificados. |
| `src/app/(site)/` | Landing/SEO publico. |
| `src/app/(public)/` | Directorios publicos, marketplace y empleo. |
| `src/components/` | UI por modulo y componentes base. |
| `src/db/schema/` | Tablas Drizzle. |
| `src/lib/` | Auth, servicios, dashboard, SEO, reportes e integraciones. |
| `src/types/` | Tipos compartidos. |

## Contratos de seguridad y release

- Un rol global no concede acceso a una academia: salvo `super_admin`, resolver tenant exige ownership o `membership` explicita.
- `profiles.role` describe identidad global; `memberships.role` controla el acceso efectivo dentro de cada academia.
- El service worker solo cachea assets estaticos. APIs, HTML privado y mutaciones offline no se cachean ni se reproducen.
- `pnpm verify:production` es la puerta compuesta: inventario de APIs, RLS, migraciones Drizzle+Supabase, typecheck, lint, Vitest y build. El inventario de Fase 1 contiene 275 rutas y 0 mutaciones con auth desconocida.
- `Network` no forma parte de los codigos persistidos/checkout (`free`, `pro`, `premium`); es oferta comercial acompanada.

## Contratos Fase 1 — trial, billing y roles

- `academy_trials` registra inicio, fin, conversión y notificaciones. La política es Starter durante 7 días, sin tarjeta, una activación por academia cada 365 días; al expirar, el acceso efectivo vuelve a Free.
- Solo el owner de la academia o un `super_admin` puede iniciar Checkout, abrir el portal, sincronizar o consultar facturación de suscripción. Un rol personalizado nunca amplía esta frontera.
- Checkout y objetos Stripe llevan `academyId`/`tenantId` explícitos. El resolver usa esa metadata como autoridad y conserva un fallback únicamente para objetos legacy.
- `billing_events` usa inserción idempotente, lease de procesamiento, reintentos y `stripe_created_at`; la suscripción guarda el último evento aplicado y rechaza snapshots anteriores.
- Los cambios/cancelaciones se hacen mediante Stripe Billing Portal. Los endpoints legacy de upgrade, downgrade, cancel y PaymentIntent manual responden `410`.
- Los roles personalizados se administran por academia, solo por owner, con permisos validados, herencia sin ciclos, asignación exclusiva a miembros y protección de roles por defecto.

## Modularizacion frontend reciente

- `DashboardPage` mantiene la coordinacion de datos del dashboard, pero delega secciones visuales compactas en `src/components/dashboard/DashboardSections.tsx` y el checklist en `src/components/dashboard/useDashboardChecklist.ts`.
- `EventForm` mantiene `react-hook-form`, validacion y envio; la logica pura vive en `src/components/events/event-form-model.ts` y las secciones visuales en `src/components/events/EventFormSections.tsx`.
- La pantalla de ajustes consume `src/components/settings/academy-settings-model.ts` para defaults, normalizacion de payload y editores deportivos activos.

## Principios

- Tenant isolation primero: auth, DB y UI deben respetar academia.
- La capa API devuelve formato estandarizado.
- Las migraciones Supabase se revisan antes de aplicar SQL destructivo.
- Las pantallas publicas no deben prometer features no implementadas.
