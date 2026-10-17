---
status: active
owner: producto
last_reviewed: 2026-10-13
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
| Framework | Next.js 15.5.27 App Router |
| UI | React 18, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes |
| Base de datos | Supabase PostgreSQL + RLS |
| ORM | Drizzle ORM |
| Auth | Supabase Auth SSR + bearer verification con contexto tenant |
| Pagos | Stripe |
| Deploy | Vercel |
| Tests | Vitest, Playwright, axe |

## Reglas que no se negocian

- Todas las APIs de tenant usan `withTenant` desde `src/lib/authz.ts`.
- Las respuestas API usan `apiSuccess`, `apiCreated` o `apiError` desde `src/lib/api-response.ts`.
- No se documentan secretos ni valores reales de entorno.
- Si un cambio afecta producto, negocio, marketing, ventas, arquitectura, deploy, seguridad o roadmap, también se actualiza esta vault.
- El cierre de cada trabajo debe indicar la nota actualizada o `Vault: no aplica`.

## Estado ejecutivo (2026-10-13)

El rebuild SaaS greenfield está en la rama `codex/zaltyko-plan-implementation` y PR #226 sigue en borrador. Hay núcleo de operación, pagos manuales, métricas, Academy Health Score, Insights y Owner Dashboard; aún faltan E2E autenticado, pruebas reales por rol, recuperación verificada, accesibilidad manual y despliegue productivo. El hotfix P0 #225 que desactiva el cron de cobro legacy sigue abierto y sin review; @elvisvaldes ya tiene permiso `write` y solicitud de revisión activa. No iniciar captación ni cobros automáticos.

El CI se prepara para migrar únicamente las 16 migraciones greenfield permitidas al esquema aislado `zaltyko` del Sandbox E2E existente; runner y contratos RLS pasan en PostgreSQL efímero local, pero aún no se han ejecutado en Supabase remoto. No se creó una rama o proyecto Supabase de pago. El Preview `READY` anterior corresponde al HEAD previo, no a los cambios locales actuales; producción sigue en `main`. Empieza por [[Estado actual de Zaltyko]] y el [plan maestro](../../docs/plans/2026-10-13-full-saas-implementation-plan.md).

Esta vault es la versión operativa y viva de la verdad del proyecto; la info técnica de detalle vive en `README.md`, `docs/` y `AGENTS.md`.

Ver también: [[Inventario de producto]], [[Arquitectura]], [[Modelo de negocio]], [[Mensajes aprobados]].
