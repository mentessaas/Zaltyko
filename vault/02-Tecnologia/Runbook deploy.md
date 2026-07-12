---
status: active
owner: tech
last_reviewed: 2026-07-12
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

## Pitfalls conocidos (jun 2026)

### ESLint v8 + flat config rompe build de Next.js 15.5

Si el proyecto usa `eslint.config.mjs` (flat config) con ESLint v8.x, el build
falla con `Invalid Options: - Unknown options: useEslintrc, extensions` porque
Next.js pasa opciones legacy a ESLint cuando detecta flat config.

**Solucion aplicada**: usar `.eslintrc.json` legacy (en vez de `eslint.config.mjs`).
ESLint v8 funciona correctamente con legacy config. Reglas react-hooks v5+
(`preserve-manual-memoization`, `purity`, `refs`, etc.) NO existen en v4 y deben
omitirse.

### hreflang cluster pages con claves vs slugs

En `generateMetadata` de paginas cluster, usar las claves internas
(`modalityKey`, `countryKey`) NO los slugs traducidos (`modality`, `country`)
al indexar `MODALITIES` / `COUNTRIES`. Los slugs ya son strings traducidos
(`artistic-gymnastics`); las claves son internas (`artistic`). Build falla con
`Cannot read properties of undefined` en prerender; dev server lo silencia con
error boundary client-side.

## Antes de produccion

- Rotar credenciales si han sido compartidas durante desarrollo.
- Revisar [[Produccion y go-live]].
- Actualizar [[Changelog interno]] con cambios relevantes para equipo.

## Promocion Fase 1 — orden obligatorio

1. Confirmar `pnpm verify:production`, tests focales de trial/webhook/roles y build.
2. Confirmar migracion Supabase `20260712230000_phase1_trial_and_billing_events.sql`, RLS 64/64 y sync de planes sin diferencias.
3. Desplegar primero preview y validar `/pricing`, autenticacion, Facturacion, inicio de trial, Checkout y Portal.
4. Promover a produccion. `CRON_SECRET` y `STRIPE_WEBHOOK_SECRET` ya fueron rotados como variables sensibles en Vercel; nunca copiar sus valores a docs o logs.
5. En Stripe conviven temporalmente el endpoint anterior y `Zaltyko production billing v2`. Verificar una entrega firmada y una reentrega idempotente en produccion; solo entonces eliminar el endpoint anterior para evitar doble entrega permanente.
6. Verificar el cron diario de lifecycle y una expiracion controlada antes de anunciar cierre de release.

El preview de Sprint 0 del 2026-07-12 quedo `Ready` y `/pricing` respondio 200 mediante acceso autenticado de Vercel. No equivale a la verificacion de produccion de Fase 1.

El gate local de Fase 1 quedó verde el 2026-07-12 con 413 tests y build de 214 páginas. Vitest se ejecuta con máximo 4 workers desde `verify-production-ready.ts`; el límite evita contención de imports/mocks observada con paralelismo irrestricto y no omite ninguna suite incluida.

## Cierre ejecutado 2026-07-13

- Preview `b9701b14` `Ready`; redeploy con target `production` para consumir las variables productivas.
- Producción `https://zaltyko-cledxek2y-mentessaas-projects.vercel.app` `Ready`, con aliases `zaltyko.com`, `www.zaltyko.com` y `zaltyko.vercel.app`.
- Smokes: `/pricing` 200 y claim 7/365 visible; `/api/billing/trial/start` 401 sin sesión; `/api/cron/trial-lifecycle` 401 sin Bearer; `/api/stripe/webhook` 400 sin firma.
- No retirar todavía el endpoint Stripe anterior: hacerlo tras observar una entrega firmada correcta en `Zaltyko production billing v2`. El endpoint antiguo firma con otro secreto y sus entregas son rechazadas; mantenerlo temporalmente solo sirve como rollback y genera reintentos ruidosos.
