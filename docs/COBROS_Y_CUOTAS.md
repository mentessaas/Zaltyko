# Cobros y cuotas (Stripe Connect Standard)

Módulo para que las academias cobren las cuotas a las familias con tarjeta, **sin que Zaltyko custodie fondos ni sea merchant of record**, y sin convertirse en software fiscal. El ledger `charges` es la única fuente de verdad; Stripe es la capa de cobro. Bizum, efectivo y transferencia se registran manualmente (ya existían).

## Arquitectura

- **Stripe Connect Standard**: cada academia conecta su propia cuenta de Stripe. La academia es merchant of record (disputas, chargebacks, IVA/fiscal). El dinero va directo a su cuenta; Zaltyko no lo custodia.
- **Direct charges** sobre la cuenta conectada (cabecera `Stripe-Account`). Tarjeta capturada 100% por Stripe (SetupIntent + Elements); Zaltyko solo guarda `customerId`, `paymentMethodId`, `brand`, `last4`.
- **Cobro recurrente**: `charges` (generados como hoy) + cobro off-session con PaymentIntent. Webhooks reconcilian el estado final.
- `application_fee` no se aplica (0). Monetización por comisión = futuro opcional.

## Variables de entorno

| Variable | Uso |
|---|---|
| `STRIPE_SECRET_KEY` | Cliente Stripe (plataforma + operaciones sobre cuentas conectadas). |
| `STRIPE_WEBHOOK_SECRET` | Webhook de plataforma (suscripción SaaS). |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Webhook de cuentas conectadas (`/api/stripe/connect/webhook`). |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js/Elements en el portal de familias. |

Configurar en Stripe **dos** endpoints de webhook: plataforma → `/api/stripe/webhook`; Connect (eventos de cuentas conectadas) → `/api/stripe/connect/webhook`.

## Tablas nuevas (migraciones `supabase/migrations/2026071412*`)

| Tabla | Propósito |
|---|---|
| `stripe_accounts` | Cuenta Connect por academia (`acct_…`, estado de habilitación). |
| `family_stripe_customers` | Customer por (academia, profile) en la cuenta conectada + display de tarjeta. |
| `payment_attempts` | Trazabilidad de cada intento de cobro. |
| `refunds` | Reembolsos emitidos. |
| `charges` (extendida) | `stripePaymentIntentId`, `stripeChargeId`, `stripeAccountId`, `attemptCount`, `lastAttemptAt`; estados `failed`/`refunded`; método `card`. |

Todas con RLS tenant (defensa en profundidad; el aislamiento real lo dan los wrappers server-side). Aplicar con el runner de migraciones antes de usar.

## Endpoints

**Academia (owner/staff, `withTenant`)**
- `POST /api/payments/connect/onboard` · `GET /api/payments/connect/status` · `POST /api/payments/connect/refresh`
- `POST /api/charges/[id]/collect` (cobrar con tarjeta) · `POST /api/charges/[id]/refund`
- `GET /api/billing/collection-stats`

**Familia (sesión Supabase)**
- `POST /api/family/payment-method/setup-intent` · `GET/POST/DELETE /api/family/payment-method`
- `POST /api/family/charges/[id]/pay` · `GET /api/family/charges/[id]/receipt`

**Webhooks / cron**
- `POST /api/stripe/connect/webhook` (`account.updated`, `payment_intent.*`, `charge.refunded`)
- `GET /api/cron/collect-charges` (cobro automático diario) · `GET /api/cron/payment-reminders` (recordatorios -3/0/+3/+7)

## Servicios clave (`src/lib/stripe/`)

- `connect-service.ts` — cuentas conectadas y estado.
- `family-customers-service.ts` — customers y tarjeta de familia; `resolvePayerCustomerForAthlete`.
- `charge-collection-service.ts` — `collectCharge` (off-session, lock, idempotencia) y `collectDueChargesForAcademy`.
- `charge-reconcile-service.ts` — reconciliación idempotente desde webhooks.
- `refund-service.ts` — reembolsos.

## Seguridad

- Tarjeta siempre Stripe-hosted; nunca PAN en DB ni logs.
- Webhooks firmados; idempotencia vía `billing_events` (unique `stripe_event_id`).
- Doble cobro evitado con `pg_advisory_xact_lock(hashtext(chargeId))` + idempotency key por (cargo, intento).
- Aislamiento por academia: operaciones con `Stripe-Account` de esa academia + `verifyAcademyAccess`.

## Checklist de go-live

1. ~~Aplicar las migraciones a la DB~~ **HECHO 2026-07-15** (6 migraciones, verificadas: 38/0 pendientes).
2. **Mergear** `feat/cobros-cuotas-stripe-connect` → `main` (dispara deploy en Vercel).
3. **Env en Vercel (Production)**: definir `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` y `STRIPE_CONNECT_WEBHOOK_SECRET` (este último lo obtienes en el paso 4).
4. **Registrar el webhook de Connect** en Stripe apuntando a `https://zaltyko.com/api/stripe/connect/webhook` con eventos `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`. Atajo: `STRIPE_SECRET_KEY=sk_live_... tsx scripts/register-connect-webhook.ts https://zaltyko.com` (imprime el signing secret para el paso 3).
5. **QA end-to-end en Stripe test mode** con una cuenta Connect de prueba: onboarding, guardar tarjeta (4242…), cobro off-session, SCA (`4000 0027 6000 3184`), rechazo (`4000…0002`), reembolso, y verificar que los webhooks reconcilian el ledger. Solo tras esto, invitar a una academia real a conectar Stripe.

Integración fiscal externa (Holded/Quipu) = fuera de alcance; se deja preparada vía export.
