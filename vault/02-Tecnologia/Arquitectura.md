---
status: active
owner: tech
last_reviewed: 2026-06-26
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
- Supabase PostgreSQL con RLS (cobertura 100% / 62 tablas tenant-scoped).
- Drizzle ORM 0.45.x (migraciones versionadas en `drizzle/`).
- NextAuth.js v5.
- Stripe.
- Tailwind CSS + shadcn/ui.
- Vercel.

> Algunos bumps de dependencias (next 15.5.19, MCP SDK 1.29, jspdf 4, xlsx por tarball, overrides de seguridad) estan en el working tree sin commitear a 2026-06-26. Ver [[Changelog interno#2026-06-26 - Upgrades de dependencias (PENDIENTE DE COMMIT)]].

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
