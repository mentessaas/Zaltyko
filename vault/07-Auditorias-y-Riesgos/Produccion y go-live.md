---
status: active
owner: tech
last_reviewed: 2026-06-22
source:
  - ../docs/PRODUCTION_CHECKLIST.md
  - ../docs/GO_LIVE_REVIEW_2026-04.md
  - ../docs/PRODUCTION_SETUP.md
---
# Produccion y go-live

## Checklist de salida

- Build limpio.
- Lint/typecheck sin errores bloqueantes.
- E2E criticos pasan.
- A11y audit ejecutada.
- Variables Vercel completas.
- Supabase RLS revisado.
- Stripe webhook activo.
- Sentry/monitoring configurado.
- Credenciales rotadas antes de produccion.

## Riesgos antes de vender fuerte

- Promesas publicas deben estar alineadas con producto.
- Pricing y checkout deben estar cerrados.
- Onboarding debe llevar a valor real.
- Soporte debe tener playbook basico.
