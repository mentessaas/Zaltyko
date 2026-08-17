# Cobros y cuotas — Stripe Connect Standard

Zaltyko permite que cada academia cobre a sus familias con su propia cuenta de Stripe. La academia es merchant of record y recibe el dinero directamente. Zaltyko no custodia fondos, no almacena datos completos de tarjeta y no actúa como software fiscal.

El ledger `charges` es la fuente operativa de verdad. Stripe procesa tarjetas y devuelve eventos que reconcilian el estado.

## Alcance

- Stripe Connect Standard por academia.
- SetupIntent + Stripe Elements para tarjeta familiar.
- PaymentIntent off-session para cobro automático.
- Cobro manual desde el panel.
- Recordatorios `-3`, `0`, `+3` y `+7` días.
- Reembolsos parciales y totales.
- Recibos internos.
- Dashboard de recaudación.
- Bizum, efectivo y transferencia como pagos manuales.

No incluye facturación fiscal, VeriFactu ni custodia de fondos.

## Arquitectura

- Direct charges sobre la cuenta conectada mediante `Stripe-Account`.
- Zaltyko guarda identificadores Stripe, marca y últimos cuatro dígitos; nunca PAN ni CVC.
- Webhooks firmados actualizan el ledger.
- `billing_events` evita procesar dos veces el mismo evento.
- `pg_advisory_xact_lock` e idempotency keys protegen contra cobros duplicados.
- `verifyAcademyAccess` y RLS aíslan academias.

## Variables

| Variable | Uso |
|---|---|
| `STRIPE_SECRET_KEY` | Plataforma y operaciones sobre cuentas conectadas |
| `STRIPE_WEBHOOK_SECRET` | Webhook de suscripción SaaS |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Webhook de cuentas conectadas |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js y Elements |

Los webhooks de plataforma y Connect deben tener secretos distintos.

## Datos

| Tabla | Propósito |
|---|---|
| `stripe_accounts` | Estado de la cuenta Connect por academia |
| `family_stripe_customers` | Customer y método familiar por academia |
| `payment_attempts` | Trazabilidad de intentos |
| `refunds` | Reembolsos |
| `charges` | Ledger de cargos y estado reconciliado |

## Endpoints principales

### Academia

- `POST /api/payments/connect/onboard`
- `GET /api/payments/connect/status`
- `POST /api/payments/connect/refresh`
- `POST /api/charges/[id]/collect`
- `POST /api/charges/[id]/refund`
- `GET /api/billing/collection-stats`

### Familia

- `POST /api/family/payment-method/setup-intent`
- `GET|POST|DELETE /api/family/payment-method`
- `POST /api/family/charges/[id]/pay`
- `GET /api/family/charges/[id]/receipt`

### Webhook y cron

- `POST /api/stripe/connect/webhook`
- `GET /api/cron/collect-charges`
- `GET /api/cron/payment-reminders`

## Estado verificado

- Migraciones del módulo aplicadas a producción.
- Webhook Connect registrado en `https://zaltyko.com/api/stripe/connect/webhook`.
- Onboarding Connect probado end-to-end en Stripe test mode.
- Corregido el retorno de onboarding a Ajustes → Cobros.
- Tests unitarios e integración cubren éxito, rechazo, SCA, reembolso, idempotencia y protección lógica contra doble cobro.

## Verificado E2E contra Stripe test mode (2026-08-10, ZAL-3)

`tests/e2e-zaltyko-stripe-connect-flow.spec.ts` — 7/7 verde en chromium contra
`http://127.0.0.1:3000` con `sk_test_*` / `pk_test_*` y la academia E2E aislada.
Reproducible con `pnpm test:e2e:stripe` (ver runbook en la cabecera del spec).

- [x] Guardar tarjeta de prueba: SetupIntent + `confirmCardSetup` con `tok_visa`, persistida vía `POST /api/family/payment-method` (display `4242`).
- [x] Cobro off-session: `POST /api/charges/[id]/collect` sobre cargo `pending` sembrado → `200`, `status=paid`, `paymentIntentId` `pi_*`.
- [x] Cron `GET /api/cron/collect-charges` autenticado con `CRON_SECRET` → `200` con totales `academies/attempted/paid/failed/skipped` (o `ALREADY_RUNNING`).
- [x] Contratos de autorización: `401` sin sesión, `403/404/409` cross-tenant y sin Connect listo; ninguno devuelve `500`.

## Pendiente antes de academia piloto

- [ ] Confirmar variables Connect correctas en el deployment activo.
- [ ] Guardar tarjeta mediante el UI de Elements (el E2E cubre la API, no los iframes).
- [ ] Ejecutar cobro inmediato desde el panel owner.
- [ ] Verificar SCA/3DS y recuperación de `requires_action`.
- [ ] Verificar tarjeta rechazada y notificación.
- [ ] Verificar reembolso parcial y total.
- [ ] Confirmar reconciliación de todos los webhooks.
- [ ] Confirmar que reintentos y eventos repetidos no duplican efectos.
- [ ] Verificar recibo interno y copy no fiscal.
- [ ] Revisar logs sin secretos ni datos sensibles.

No usar claves live ni cobrar a una familia real para completar QA. El paso a producción real requiere una academia piloto informada y un flujo de rollback.
