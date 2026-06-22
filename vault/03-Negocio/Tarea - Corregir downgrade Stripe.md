---
status: active
owner: tech
last_reviewed: 2026-06-22
source:
  - ../src/app/api/billing/downgrade/route.ts
  - ../src/app/api/billing/upgrade/route.ts
  - Pricing
---
# Tarea - Corregir downgrade Stripe

## Objetivo

Evitar errores de cambio de plan y desincronizacion billing/DB cuando una suscripcion baja de plan pago a otro plan pago.

## Problema

`/api/billing/downgrade` usa `currentSubscription.stripeSubscriptionId` como `items[0].id` al actualizar Stripe. Ese valor es el ID de suscripcion, no el ID del subscription item. `/api/billing/upgrade` ya usa el patron correcto: recuperar la suscripcion desde Stripe y tomar `stripeSub.items.data[0]?.id`.

## Alcance

- Cambiar downgrade para recuperar subscription item real.
- Validar que `targetPlan !== "free"` tenga `stripePriceId`.
- Mantener cancelacion a Free como `cancel_at_period_end`.
- Actualizar DB solo si Stripe responde correctamente.

## Criterios de aceptacion

- Downgrade pago -> pago no falla por item ID incorrecto.
- Downgrade pago -> Free sigue programando cancelacion.
- Errores de Stripe devuelven `apiError` sin modificar DB.

## Pruebas

- Test unitario o mock de Stripe para ruta downgrade.
- QA manual con Stripe test si hay credenciales.

## Resultado 2026-06-22

- Implementado helper `getPrimarySubscriptionItemId` en `src/lib/stripe/subscription-items.ts`.
- `/api/billing/downgrade` recupera la suscripcion desde Stripe y usa el subscription item real.
- Si el plan pago destino no tiene `stripePriceId`, devuelve `PLAN_PRICE_NOT_CONFIGURED` antes de tocar Stripe/DB.
- Test agregado: `tests/lib/stripe-subscription-items.test.ts`.
- Verificacion ejecutada: `pnpm exec vitest run tests/lib/stripe-subscription-items.test.ts`.
