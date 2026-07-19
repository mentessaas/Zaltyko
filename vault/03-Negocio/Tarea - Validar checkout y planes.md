---
status: active
owner: negocio
last_reviewed: 2026-06-22
source:
  - ../src/app/(site)/pricing.tsx
  - ../src/lib/plans/catalog.ts
  - ../src/app/api/billing/checkout/route.ts
  - ../src/lib/stripe/sync-plans.ts
---
# Tarea - Validar checkout y planes

## Objetivo

Dejar pricing, limites y checkout alineados antes de vender activamente.

## Alcance

- Confirmar nombres publicos: Starter, Growth, Network.
- Confirmar codigos internos: `free`, `pro`, `premium`.
- Confirmar limites: 50, 200, ilimitado para atletas; grupos/clases segun catalogo y `limits.ts`.
- Confirmar que DB `plans` tiene Stripe price IDs reales en entornos de pago.
- Mantener anual como "proximamente" o implementar price anual real.

## Criterios de aceptacion

- `/pricing` y billing interno muestran los mismos limites.
- `/api/billing/checkout` no puede crear checkout para plan sin `stripePriceId`.
- Produccion no usa `price_pro_PLACEHOLDER` ni `price_premium_PLACEHOLDER`.

## Pruebas

- Revisar tabla `plans`.
- Ejecutar `pnpm stripe:sync` cuando se creen/editen precios Stripe.
- QA de checkout con Stripe test.

## Resultado 2026-06-22

- Confirmado en codigo: nombres publicos actuales son Starter/Growth/Network desde `src/lib/plans/catalog.ts`.
- Confirmado en codigo: codigos internos siguen siendo `free`, `pro`, `premium`.
- Confirmado en codigo: `/api/billing/checkout` rechaza planes sin `stripePriceId`.
- Confirmado en UI publica: anual se muestra como "proximamente"; no hay compra anual directa.
- Guardrail vigente: produccion no debe usar placeholders `price_pro_PLACEHOLDER` ni `price_premium_PLACEHOLDER`; usar `pnpm stripe:sync` o `SEED_STRIPE_PRICE_*`.
