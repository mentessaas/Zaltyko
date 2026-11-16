# Cobros y cuotas — Stripe Connect Standard

Zaltyko permite que cada academia cobre a sus familias con su propia cuenta de Stripe. La academia es merchant of record y recibe el dinero directamente. Zaltyko no custodia fondos, no almacena datos completos de tarjeta y no actúa como software fiscal.

El ledger `charges` es la fuente operativa de verdad. Stripe procesa tarjetas y devuelve eventos que reconcilian el estado.

> **Aviso (16-11-2026).** El cobro automático de cuotas se rehace con
> Stripe Connect y cuentas Accounts v2, según ADR-0028
> (`docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md`). Lo
> nuevo está en «Conectar Stripe (Fase 1)». El resto de esta guía describe el
> modelo Stripe Connect Standard v1 (`stripe_accounts`), que nunca se abrió a
> academias reales y ya no es la dirección del producto.

## Conectar Stripe (Fase 1)

La academia conecta su propia cuenta de Stripe desde Ajustes. **En esta fase no
se cobra nada**: solo se crea la cuenta conectada y se sigue su estado. Los
cobros a familias llegan en fases posteriores del ADR-0028.

### Quién puede usarlo

Todas estas condiciones a la vez (el primer motivo que falla es el que se
devuelve):

- Bandera `ZALTYKO_CONNECT_ONBOARDING_ENABLED=true` (texto exacto). **Apagada
  por defecto.**
- Clave `STRIPE_SECRET_KEY` de prueba (`sk_test_`/`rk_test_`). **Live cerrado
  por código** en esta fase, aunque la bandera esté encendida.
- Base de datos con las dos columnas del candidato (ver «Estado»). Sin ellas la
  función responde «no disponible» en vez de fallar.
- Persona con rol de dueña, o administración con acceso a todas las sedes.
- Academia de España (`ES`). Las demás ven que el cobro automático llegará más
  adelante a su país.
- Plan de pago vigente (Starter o Growth). La prueba gratuita no cuenta.

Si la academia ya tiene cuenta conectada, el país y el plan no ocultan su
estado: lo sigue viendo.

### Pantalla

- Tarjeta «Cobro automático de cuotas» en `/owner/settings`, con el ancla
  `#cobro-automatico`. Solo aparece con la bandera encendida.
- `/owner/payments` enlaza a esa tarjeta cuando la bandera está encendida y la
  academia aún no ha conectado su cuenta (o le falta el plan de pago). Solo lo
  ve la dueña con todas las sedes, y sin llamar a Stripe.
- Estados: sin conectar, pendiente de datos, en revisión, lista para cobrar y
  con problemas. «Lista para cobrar» depende solo de la tarjeta; la
  domiciliación SEPA se muestra aparte.

### Rutas

| Ruta | Uso |
|---|---|
| `GET /api/v1/owner/payments/connect?organizationId=…` | Estado para la tarjeta de Ajustes. Con `&refresh=1` vuelve a leer la cuenta en Stripe, como mucho una vez por minuto. |
| `POST /api/v1/owner/payments/connect` | Crea la cuenta conectada si no existe (una por academia y entorno) y devuelve el enlace de alta de Stripe. |
| `GET /api/v1/owner/payments/connect/link?organizationId=…` | Enlace caducado o ya usado: pide uno nuevo y redirige a Stripe. **Solo renueva el enlace de una cuenta que ya existe; nunca la crea.** |
| `POST /api/stripe/connect/accounts-webhook` | Eventos *thin* v2 de las cuentas conectadas. Verifica la firma, vuelve a leer la cuenta en Stripe y guarda el estado. Con la bandera apagada no procesa nada. |

La vuelta desde Stripe llega a `/owner/settings?…&stripe=vuelta#cobro-automatico`.
Código en `src/modules/payments-connect/`, separado de `src/lib/stripe/*`.

### Variables

| Variable | Uso |
|---|---|
| `ZALTYKO_CONNECT_ONBOARDING_ENABLED` | Enciende la función. Apagada por defecto. |
| `STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET` | Firma del webhook de eventos v2 de cuentas conectadas. Distinto de `STRIPE_CONNECT_WEBHOOK_SECRET` (webhook v1 antiguo). |

### Datos

Zaltyko guarda solo códigos de estado en
`organization_payment_provider_accounts`: estado de la cuenta, de la tarjeta y
de la domiciliación, y un resumen cerrado de requisitos pendientes (`none`,
`user_action`, `stripe_review`, `past_due`). Nunca nombres, documentos ni datos
bancarios: esos los recoge y guarda Stripe en su propio formulario. Cada cambio
de estado sube `revision` y deja auditoría y evento. El estado `pending` del
enum no se usa: la fila nace en `onboarding`.

### Estado

- Candidata `docs/deployment/candidates/20261116120000_connect_onboarding_candidate.sql`:
  **sin aplicar en ningún entorno** (ni staging ni producción). Cada
  aplicación necesita autorización de Elvis.
- Pruebas automáticas (`tests/payments-connect-*`, `tests/api-payments-connect-routes.test.ts`,
  `tests/api-connect-accounts-webhook.test.ts`, `tests/owner-stripe-connect-card.test.tsx`):
  ninguna en local; las ejecuta la CI remota de la PR. **Sin probar en staging**
  todavía: falta el destino de eventos v2 en Stripe sandbox, las variables en
  Vercel staging y la candidata en Supabase staging (ver ADR-0028, «Preparación
  de staging»).
- En producción no cambia nada: la bandera está apagada.

## Alcance

- Stripe Connect Standard por academia.
- SetupIntent + Stripe Elements para tarjeta familiar.
- Cobro familiar automático con PaymentIntent off-session: previsto, no
  liberado en este lanzamiento.
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

## Estado verificado (modelo Standard v1 retirado)

> Este bloque y la lista «Pendiente antes de academia piloto» son del modelo
> Stripe Connect Standard v1 (`stripe_accounts`, webhook v1). Se conservan como
> registro histórico; no describen «Conectar Stripe (Fase 1)».

- Migraciones del módulo aplicadas a producción.
- Webhook Connect registrado en `https://zaltyko.com/api/stripe/connect/webhook`.
- Onboarding Connect probado end-to-end en Stripe test mode.
- Corregido el retorno de onboarding a Ajustes → Cobros.
- Tests unitarios e integración cubren éxito, rechazo, SCA, reembolso, idempotencia y protección lógica contra doble cobro.

## Pendiente antes de academia piloto

- [ ] Confirmar variables Connect correctas en el deployment activo.
- [ ] Guardar tarjeta real de prueba mediante Elements.
- [ ] Ejecutar cobro inmediato.
- [ ] Ejecutar cobro off-session.
- [ ] Verificar SCA/3DS y recuperación de `requires_action`.
- [ ] Verificar tarjeta rechazada y notificación.
- [ ] Verificar reembolso parcial y total.
- [ ] Confirmar reconciliación de todos los webhooks.
- [ ] Confirmar que reintentos y eventos repetidos no duplican efectos.
- [ ] Verificar recibo interno y copy no fiscal.
- [ ] Revisar logs sin secretos ni datos sensibles.

No usar claves live ni cobrar a una familia real para completar QA. El paso a producción real requiere una academia piloto informada y un flujo de rollback.
