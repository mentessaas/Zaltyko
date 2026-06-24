---
status: active
owner: producto
last_reviewed: 2026-06-24
source:
  - ../README.md
  - ../AGENTS.md
  - ../ROADMAP.md
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
---
# Zaltyko

Zaltyko es un SaaS multi-tenant para gestionar academias deportivas, con foco inicial en gimnasia y expansión a otras disciplinas. El producto combina operaciones de academia, gestión de atletas, clases, billing, eventos, evaluaciones, comunicación, marketplace/empleo y SEO local.

## Primero lee esto

- [[Guia de trabajo para agentes]] antes de que cualquier agente, IA o programador toque codigo, docs, pricing, migraciones o roadmap.
- [[Estado actual de Zaltyko]] para saber qué existe, qué falta y qué es urgente.
- [[Mapa de navegación]] para entrar por rol: desarrollo, producto, marketing, ventas o founder.
- [[Workflow diario de la vault]] para saber que actualizar antes de cerrar cambios.
- [[Glosario]] para términos del dominio y del sistema.
- [[Roadmap maestro]] para la dirección de producto.
- [[Backlog priorizado]] para saber qué hacer ahora.

## Cómo correr el proyecto

```bash
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abrir `http://localhost:3000`.

## Stack actual

| Capa | Decisión |
| --- | --- |
| Framework | Next.js 15.5.x App Router |
| UI | React 18, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes |
| Base de datos | Supabase PostgreSQL + RLS |
| ORM | Drizzle ORM |
| Auth | NextAuth.js v5 con contexto tenant |
| Pagos | Stripe |
| Deploy | Vercel |
| Tests | Vitest, Playwright, axe |

## Reglas que no se negocian

- Todas las APIs de tenant usan `withTenant` desde `src/lib/authz.ts`.
- Las respuestas API usan `apiSuccess`, `apiCreated` o `apiError` desde `src/lib/api-response.ts`.
- No se documentan secretos ni valores reales de entorno.
- Si un cambio afecta producto, negocio, marketing, ventas, arquitectura, deploy, seguridad o roadmap, también se actualiza esta vault.
- El cierre de cada trabajo debe indicar la nota actualizada o `Vault: no aplica`.

## Estado ejecutivo

Zaltyko tiene una base técnica y de dominio amplia, pero la información está distribuida entre `README.md`, `docs/`, análisis de negocio, auditorías y planes. Esta vault existe para mantener una versión operativa, navegable y viva de la verdad del proyecto.

Ver también: [[Inventario de producto]], [[Arquitectura]], [[Modelo de negocio]], [[Mensajes aprobados]].
