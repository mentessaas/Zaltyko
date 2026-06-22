---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../docs/marketing/zaltyko-pricing.md
---
# Modulo - Billing

## Objetivo

Gestionar cobros, cargos, descuentos, becas, recibos, planes, suscripciones e indicadores financieros.

## Estado

Avanzado en infraestructura y operaciones internas. Alto riesgo comercial por inconsistencias entre pricing, limites y checkout.

## Tenemos

- Cargos automaticos y manuales.
- Items de facturacion.
- Descuentos y becas.
- Recibos.
- Stripe y webhooks.
- Reportes financieros parciales.
- Catalogo central de planes en `src/lib/plans/catalog.ts`.
- Checkout activo en `/api/billing/checkout` con `withTenant` y `plans.stripePriceId`.
- Endpoint viejo `/api/stripe/checkout` deprecado con 410.

## Riesgos

- Downgrade Stripe pago -> pago usa un item ID incorrecto; ver [[Tarea - Corregir downgrade Stripe]].
- Checkout anual no esta implementado como price anual real; la UI publica debe mantenerlo como "proximamente" o implementarlo.
- DB puede quedar con placeholders si se ejecuta seed sin `SEED_STRIPE_PRICE_PRO`/`SEED_STRIPE_PRICE_PREMIUM`.
- Proyecciones, contabilidad y facturacion electronica no deben prometerse como completas sin evidencia.

## Proximos pasos

- Resolver [[Pricing]] como fuente comercial unica.
- Validar limites desde codigo y base de datos.
- Crear tests para filtros sport-aware y reportes financieros.
- Ejecutar [[Tarea - Validar checkout y planes]] antes de salida comercial.
