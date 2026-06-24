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
