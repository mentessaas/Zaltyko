---
status: active
owner: negocio
last_reviewed: 2026-06-22
source:
  - ../BUSINESS-ANALYSIS.md
  - ../docs/marketing/zaltyko-pricing.md
  - ../src/lib/limits.ts
---
# Pricing

## Fuente de verdad comercial

Esta nota debe revisarse antes de cambiar landing, checkout, limites de plan o discurso de ventas.

## Planes documentados

| Fuente | Planes | Nota |
| --- | --- | --- |
| Catalogo actual | Starter, Growth, Network | `src/lib/plans/catalog.ts` mapea `free`, `pro`, `premium` a nombres publicos. |
| DB/checkout | `free`, `pro`, `premium` | `plans.code` y `/api/billing/checkout` usan estos codigos internos. |
| Estrategia antigua | Starter, Professional, Business, Enterprise | Documento de marketing; no es la implementacion actual. |
| Analisis antiguo | Free, Pro, Premium | Detectaba bug historico; parte ya esta corregida por `PRODUCT_PLANS`. |

## Fuente de verdad tecnica actual

| Capa | Fuente | Estado |
| --- | --- | --- |
| Copy publico | `src/app/(site)/pricing.tsx` + `src/lib/plans/catalog.ts` | Usa Starter/Growth/Network. |
| Limites de producto | `src/lib/plans/catalog.ts` y tabla `plans` | Starter 50, Growth 200, Network ilimitado. |
| Enforcements | `src/lib/limits.ts` | Lee `plans.athleteLimit`; clases/grupos son constantes por codigo. |
| Checkout activo | `src/app/api/billing/checkout/route.ts` | Usa `plans.stripePriceId`, `mode: subscription`, tenant auth. |
| Checkout viejo | `src/app/api/stripe/checkout/route.ts` | Deprecated 410. |
| Sync Stripe | `src/lib/stripe/sync-plans.ts` | Sincroniza precios activos por metadata `plan_code` y `athlete_limit`. |

## Inconsistencias a resolver

| Tema | Riesgo | Accion |
| --- | --- | --- |
| Annual billing | UI muestra anual como "proximamente"; checkout solo usa un `stripePriceId` por plan. | Mantener CTA a demo o implementar price anual real antes de permitir compra anual. |
| DB seed placeholders | `scripts/seed.ts` usa `price_pro_PLACEHOLDER` y `price_premium_PLACEHOLDER` si faltan env vars. | En entornos reales ejecutar `pnpm stripe:sync` o setear `SEED_STRIPE_PRICE_*`. |
| Downgrade Stripe | `/api/billing/downgrade` usa `stripeSubscriptionId` como item id al cambiar a otro plan pago. | Corregir consultando `stripe.subscriptions.retrieve(...).items.data[0].id`, igual que upgrade. |
| Nombres historicos | Docs antiguas hablan de Professional/Business o Free/Pro/Premium publico. | Usar Starter/Growth/Network en marketing; free/pro/premium solo interno. |
| Network/Premium | Valor diferencial debe estar ligado a multi-sede, limites amplios, reportes y soporte. | Evitar prometer integraciones custom sin alcance. |

## Regla

No publicar cambios de pricing sin actualizar esta nota, [[Mensajes aprobados]] y las pruebas/manual QA del checkout.
