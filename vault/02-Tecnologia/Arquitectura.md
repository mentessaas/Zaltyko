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
- Supabase PostgreSQL con RLS (cobertura de fuentes 100% / 63 tablas tenant-scoped).
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
- `pnpm verify:production` es la puerta compuesta: inventario de 272 APIs, RLS, migraciones Drizzle+Supabase, typecheck, lint, Vitest y build.
- `Network` no forma parte de los codigos persistidos/checkout (`free`, `pro`, `premium`); es oferta comercial acompanada.

## Modularizacion frontend reciente

- `DashboardPage` mantiene la coordinacion de datos del dashboard, pero delega secciones visuales compactas en `src/components/dashboard/DashboardSections.tsx` y el checklist en `src/components/dashboard/useDashboardChecklist.ts`.
- `EventForm` mantiene `react-hook-form`, validacion y envio; la logica pura vive en `src/components/events/event-form-model.ts` y las secciones visuales en `src/components/events/EventFormSections.tsx`.
- La pantalla de ajustes consume `src/components/settings/academy-settings-model.ts` para defaults, normalizacion de payload y editores deportivos activos.

## Principios

- Tenant isolation primero: auth, DB y UI deben respetar academia.
- La capa API devuelve formato estandarizado.
- Las migraciones Supabase se revisan antes de aplicar SQL destructivo.
- Las pantallas publicas no deben prometer features no implementadas.
