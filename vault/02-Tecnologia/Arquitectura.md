---
status: active
owner: tech
last_reviewed: 2026-06-22
source:
  - ../README.md
  - ../AGENTS.md
  - ../docs/architecture.md
  - ../package.json
---
# Arquitectura

## Stack

- Next.js 15.5.x App Router.
- React 18.3.x.
- Supabase PostgreSQL con RLS.
- Drizzle ORM.
- NextAuth.js v5.
- Stripe.
- Tailwind CSS + shadcn/ui.
- Vercel.

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

## Principios

- Tenant isolation primero: auth, DB y UI deben respetar academia.
- La capa API devuelve formato estandarizado.
- Las migraciones Supabase se revisan antes de aplicar SQL destructivo.
- Las pantallas publicas no deben prometer features no implementadas.
