---
status: active
owner: tech
last_reviewed: 2026-06-22
source:
  - ../docs/DEPLOYMENT.md
  - ../docs/VERCEL-DEPLOYMENT.md
  - ../docs/PRODUCTION_CHECKLIST.md
---
# Runbook deploy

## Plataforma

- Frontend/backend: Vercel.
- Base de datos y storage: Supabase.
- Pagos: Stripe.
- Observabilidad: Sentry, Vercel Analytics/Speed Insights segun configuracion.

## Checklist minimo

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Tests relevantes.
- Variables en Vercel revisadas contra `.env.example`.
- Webhooks Stripe verificados.
- RLS y migraciones confirmadas.
- No hay secretos en logs, docs o capturas.

## Antes de produccion

- Rotar credenciales si han sido compartidas durante desarrollo.
- Revisar [[Produccion y go-live]].
- Actualizar [[Changelog interno]] con cambios relevantes para equipo.
