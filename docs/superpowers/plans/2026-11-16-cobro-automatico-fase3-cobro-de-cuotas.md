# Cobro automático — Fase 3 «Cobrar las cuotas»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado: SOLO PLAN.** No se construye nada hasta que Elvis autorice empezar. Elvis respondió P1–P3 el 16-11-2026 (abajo). Revisado una vez contra el código (859b160); esta versión incorpora esa revisión y las respuestas.

**Goal:** Cada día, las cuotas mensuales de una academia que cobra en automático se cobran solas con la tarjeta o la domiciliación que la familia guardó en la Fase 2, en la cuenta Stripe de la academia. Nunca se cobra dos veces, nunca se cobra a quien ya no paga, todo cobro hecho en Stripe queda registrado, y ninguna cuota se queda sin cobrar y sin recordatorio.

**Architecture:** Módulo nuevo `src/modules/family-collection/` (dominio puro, adaptador Stripe, almacén, servicio del proceso), ruta cron `/api/cron/collect-family-fees` lanzada por pg_cron, y cambios acotados en `src/modules/billing/` y `src/modules/payments-connect/`. Cada cobro es un **intento** en una tabla nueva, que avanza por pasos cortos: reclamar → crear el cobro en Stripe → guardar su id → confirmarlo → registrar el resultado. Stripe nunca va dentro de una transacción, y cada paso se puede repetir sin cobrar otra vez. El proceso diario también relee en Stripe los intentos que se quedaron a medias o en curso, así que la Fase 3 se cierra sola sin webhook; la Fase 4 lo hará más rápido y añadirá devoluciones, disputas y la recuperación del 3DS.

**Tech Stack:** Next.js 15 App Router, Drizzle + `drizzle-orm/sql`, `stripe@^22.6.2` (apiVersion `2026-08-26.dahlia`), Zod, Vitest, pg_cron + pg_net (Supabase).

**Spec:** `docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md` («Fase 3», P1–P3, D2–D4, deuda «persona que deja de ser pagadora»). También ADR-0020, ADR-0022 (cuenta conectada y frescura), ADR-0025/0026 (cobros y cuota mensual), ADR-0016 (planificador). Base: Fases 1 y 2.

## Decisiones de Elvis (16-11-2026)

| | Pregunta | Respuesta | Cómo la aplica el plan |
|---|---|---|---|
| **P1** | ¿Un cobro por gimnasta o uno por familia, sede y mes? | **Uno por familia, sede y mes** (la factura mensual). | Importe = saldo de las cuotas automáticas de la factura. Inconvenientes conocidos: una devolución del banco afecta a todas las cuotas del cobro, y con un pago parcial a mano el cobro no coincide con el total de la factura. |
| **P2** | ¿Qué día se cobra? | **La academia elige**: el día de vencimiento de la cuota (por defecto) o un día fijo del mes. | Ajuste por academia «Día de cobro» (Tareas 1, 2, 4 y 8). *Mi propuesta, a confirmar:* día fijo entre 1 y 28, y **nunca antes del vencimiento** (si el día fijo cae antes, se cobra el día del vencimiento). Para SEPA, el aviso previo depende de L4. |
| **P3** | ¿Reintentos? | **Tarjeta rechazada: un reintento a los 3 días. SEPA: ninguno. Después, cobro manual con recordatorios.** | *Mi propuesta, a confirmar:* no se reintenta cuando el rechazo dice que la tarjeta está perdida, robada o es fraude (repetir no sirve y puede alertar al banco), ni cuando el banco pide autenticación. |

Sin respuesta, con propuesta: **¿se avisa antes a la familia?** No en esta fase. El portal muestra «Se cobrará automáticamente el {fecha}» y, en SEPA, Stripe envía el aviso previo del adeudo; un correo de Zaltyko el día antes encaja en la Fase 4, con el recibo.

L3/L4 (texto de consentimiento y orden SEPA) siguen pendientes del abogado: sin ellas no se activa con familias reales.

## Global Constraints

**Entornos y verificación**

- No se ejecutan builds, tests, typecheck, lint ni instalaciones en el Mac. «Run» = push a la PR (en borrador) y comprobar en GitHub Actions los runs del SHA de cabeza ya completados. `gh pr checks` vacío no es verde. Cada push cancela la CI web en curso: agrupar commits.
- No tocar `scripts/ci/verify-sandbox-schema-replay.sh`, `supabase/schema-snapshot-manifest.json` ni `.github/workflows/ci-isolated.yml`.
- Nada contra Stripe Live ni contra Vercel o Supabase de producción. Staging (candidata, bandera, trabajo de pg_cron) necesita autorización expresa de Elvis.
- **Cerrojos como R11:** no se cobra si `resolveConnectEnvironment() !== "test"` o `isProductionDatabase()`. En esta fase no existe ninguna vía para abrir Live ni producción.
- La bandera de la Fase 3 puede probarse en staging con tarjeta sola. Las domiciliaciones se cierran solas con la relectura diaria (Tarea 5), pero tardan días; se prueban en staging cuando Elvis lo autorice.

**Dinero (reglas que no se pueden romper)**

- **Nunca dos cobros de la misma factura e intento:** un intento no terminal por factura (índice único parcial) y, en Stripe, crear y confirmar por separado con claves de idempotencia propias; al reanudar se usa el `pi_…` guardado o se busca por metadata antes de crear (las claves de Stripe pueden caducar a las 24 h, y el proceso es diario).
- **Nunca se marca un intento como fallido sin haber leído en Stripe** el estado de su cobro, si llegó a crearse.
- **Todo cobro hecho queda registrado:** el pago (`payments`, origen `provider`) se graba en una transacción que no puede fallar por saldos; el reparto entre cuotas va después y lo que no quepa queda sin repartir, con aviso a la academia para revisarlo.
- **Nunca se cobra a quien ya no paga:** cada cuota del cobro debe tener el pagador de la factura, y ese pagador debe estar vigente hoy (`family_payers` abierto, tutor y vínculo activos), además de la puerta existente.
- **Ninguna cuota en el limbo:** si en la fecha de cobro la puerta falla por un motivo que no es pasajero, se escribe un intento terminal `canceled` con el motivo; con la bandera apagada, las cuotas automáticas se tratan como manuales para pagos y recordatorios.
- **Orden de bloqueo único** en todas las transacciones que tocan cuotas: fila de `organizations` (`lockOrganizationForSaasMutation`, como `lockCommand`) → cargos por id → factura → intento. Lo siguen reclamar, aplicar, cancelar y el pago manual.

**Datos y secretos**

- Solo referencias opacas (`pi_…`, `pm_…`, `cus_…`, `mandate_…`) y códigos de Stripe (`code`, `decline_code`). Nunca mensajes de Stripe, IBAN, tarjeta ni nombres.
- Metadata en Stripe: solo ids (`zaltyko_organization_id`, `zaltyko_invoice_id`, `zaltyko_collection_attempt_id`). Descripción: «Cuota {mes} {año}» (p. ej. «Cuota noviembre 2026»), nunca la referencia interna.
- Migraciones solo como candidatas, clasificadas en derechos de datos en la misma PR y con el espejo Drizzle en el módulo (no en `src/db/schema/`, por `validate:rls`).

**Alcance**

- Solo **facturas mensuales** (las de `monthly-invoice/issue.ts`). Las facturas manuales siguen siempre en manual.
- Bandera `ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED === "true"`, apagada por defecto (`runtimeEnabled` de `evaluateCollectionEligibility`).
- Sin `application_fee`, cargo directo (`stripeAccount`), moneda `EUR` en la base (`eur` solo en el adaptador).
- Las rutas antiguas (`/api/family/*`, `/api/charges/[id]/collect`, `/api/cron/collect-charges`) siguen cerradas.

**Textos**

- Español sencillo: «cobro automático», «se cobrará el {fecha}», «cobro en curso», «no se pudo cobrar», «cobrar a mano». Nunca «PaymentIntent», «off-session», «webhook», «Connect».
- Rutas nuevas con `no-store` y anotación de `scripts/lib/route-auth-classifier.ts`; la ruta cron con `requireCronAuth` + `runCronWithLease` (el lease evita solapes, pero la corrección no depende de él).

## Review Focus

1. **Caída en cualquier punto y reanudación al día siguiente** (más de 24 h): nunca un segundo cobro. Test pg «confirmado en Stripe, caída antes de registrar, reanudación a las 25 h → cero creaciones nuevas y pago registrado».
2. **Stripe cobró pero la cuota ya estaba pagada a mano** (o anulada): el pago queda registrado y la academia recibe un aviso para revisarlo; el intento nunca queda `failed`.
3. **La familia revoca, cambia de pagador o la academia pasa a manual** entre la emisión y la fecha de cobro: no se cobra y la cuota vuelve a manual con recordatorios.
4. **Pago manual mientras hay un cobro en curso**, y al revés: sin bloqueos mutuos, 409 claro o cancelación del reintento pendiente.
5. **Se apaga la bandera con cuotas automáticas emitidas** (vuelta atrás de la Fase 5): todas se pueden pagar a mano y reciben recordatorios.

---

### Task 1: Migración candidata, espejo Drizzle, derechos de datos y almacén

**Files:** `docs/deployment/candidates/<fecha>_family_collection_attempts_candidate.sql`, README de candidatas, `src/modules/family-collection/infrastructure/family-collection-schema.ts`, `application/storage.ts`, `src/modules/data-rights/application/catalog.ts` (+ política de disposición), `tests/family-collection-pg.test.ts`.

Tabla `zaltyko.family_collection_attempts` (un intento de cobrar una factura):

| columna | regla |
|---|---|
| `id`, `organization_id` (FK cascade), `location_id`, `invoice_id`, `family_id`, `family_payer_id`, `authorization_id`, `payment_provider_account_id` | FK compuestas `restrict`, como Fase 2 |
| `attempt_number` | `int`, `1..5`; `unique (organization_id, invoice_id, attempt_number)` |
| `payment_method_kind` | `card` \| `sepa_debit` |
| `amount_cents`, `currency` | `> 0`; `currency = 'EUR'` |
| `status` | `claimed`, `created`, `processing`, `succeeded`, `failed`, `canceled` |
| `provider_payment_intent_reference` | null solo en `claimed`; `unique (organization_id, provider_payment_intent_reference)` |
| `failure_code`, `decline_code` | solo códigos, ≤ 64; en `canceled` sin Stripe, `failure_code` = motivo de la puerta |
| `next_retry_at` | solo en `failed` con reintento pendiente |
| `resume_count` | `int not null default 0`, `0..3` |
| `payment_id` | FK al pago registrado; no null en `succeeded` |
| `allocation_status` | `pending` \| `allocated` \| `needs_review`; no null en `succeeded` |
| `claimed_at`, `completed_at`, `created_at`, `updated_at` | |

- Índice único parcial «un intento no terminal por factura» (`claimed`, `created`, `processing`); índices `(organization_id, status, next_retry_at)` y `(status, claimed_at)` para reanudar.
- Tabla `zaltyko.family_collection_attempt_charges`: `attempt_id`, `organization_id`, `charge_id`, `amount_cents > 0`; PK `(attempt_id, charge_id)`.
- Tabla `zaltyko.organization_collection_settings` (P2): `organization_id` PK (FK cascade), `collection_day_of_month smallint` (null = día de vencimiento; si no, `1..28`), `version int`, `updated_by_member_id`, `updated_at`. Sin fila = día de vencimiento.
- RLS `enable` + `force`, solo `service_role` (select, insert, update).
- Derechos de datos: grupo opcional excluido nuevo (solo recuento), como `OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES`, con su test de columnas.
- No se reutiliza `zaltyko.payment_attempts`: exige `provider_attempt_id` antes de Stripe, no enlaza cargos y usa `sandbox|live`. Queda documentado en la candidata.

- [ ] Test pg de esquema (checks, únicos, índice parcial, preflight, limpieza que deja la base igual), candidata, espejo, almacén, clasificación. Run. Commit.

### Task 2: Dominio — qué se cobra, puerta completa, reintentos y resultado de Stripe

**Files:** `src/modules/family-collection/domain/{collection-plan,collection-gate,retry-policy,payment-outcome}.ts`, `application/config.ts`, `tests/family-collection-domain.test.ts`.

**Produces:**

- `collectionDate({ dueDateLocal, collectionDayOfMonth })` → fecha local de cobro (P2): sin día fijo, el día de vencimiento; con día fijo `D`, el día `D` del mes del vencimiento, salvo que sea anterior al vencimiento, en cuyo caso el día de vencimiento.
- `planInvoiceCollection({ invoice, charges, todayLocal, collectionDayOfMonth })` → `{ collect: true; amountCents; allocations: { chargeId; amountCents }[] } | { collect: false; reason }`. Solo factura mensual `issued`/`partially_paid`, cargos `automatic` `due`/`partially_paid` con saldo, cuya **fecha de cobro local** (`collectionDate` sobre el `due_at` en la zona de la sede; `due_at` es las 23:59:59.999 del día de vencimiento, `calendar-due-date.ts:18`) sea ≤ hoy local. Importe = suma de saldos (P1). Razones: `not_monthly`, `invoice_closed`, `nothing_due`, `not_due_yet`, `mixed_currency`.
- `evaluateFamilyCollectionGate(input)`: `flag_off`, `environment_unknown`, `live_not_released`, `storage_missing`; después **`evaluateCollectionEligibility` para cada cargo del reparto** (todos con el `familyPayerId` de la factura); después `payer_missing`, `payer_not_current`, `payment_method_unknown`, `sepa_not_active`, `account_stale`. Clasifica cada motivo como `transient` (no escribe) o `final` (intento `canceled`). Son `transient`: `account_stale`, `flag_off`, `environment_unknown`, `live_not_released`, `storage_missing` y los de plan de la academia. El resto es `final`.
- `nextRetry({ kind, attemptNumber, code, declineCode, now })` → `Date | null` (P3a): solo tarjeta, `attemptNumber === 1` y rechazo blando (`insufficient_funds`, `processing_error`, `try_again_later`, `approve_with_id`…, lista exportada y testeada). Nunca en `lost_card`, `stolen_card`, `fraudulent`, `do_not_try_again`, `pickup_card`, SEPA ni `authentication_required`.
- `mapPaymentIntent(snapshot | error)` → `succeeded` | `processing` | `requires_confirmation` (creado y sin confirmar) | `{ failed: { code; declineCode } }` | `transient` | `idempotency_conflict`. `authentication_required` → `failed` terminal en esta fase (la Fase 4 la hará recuperable).
- `config.ts`: `isFamilyAutomaticCollectionFlagEnabled()` (texto exacto `"true"`), reexporta los cerrojos de payments-connect.

- [ ] Tests de cada rama: día fijo antes, igual y después del vencimiento, y sin día fijo; pago parcial previo, cuota manual mezclada, límite de día en Madrid y en Ciudad de México, cada motivo y su clase, cada código de rechazo de la lista. Implementar. Run. Commit.

### Task 3: Adaptador Stripe del cobro

**Files:** `src/modules/family-collection/infrastructure/stripe-collection-gateway.ts`, `tests/family-collection-gateway.test.ts`.

```ts
export interface FamilyCollectionGateway {
  createPayment(input: { connectedAccount; attempt: { id; invoiceId; attemptNumber }; amountCents; customer; paymentMethod; kind; mandate: string | null; organizationId; description }): Promise<PaymentIntentSnapshot>;
  confirmPayment(input: { connectedAccount; paymentIntentId; attempt: { invoiceId; attemptNumber } }): Promise<PaymentIntentSnapshot | CollectionError>;
  retrievePayment(input: { connectedAccount; paymentIntentId }): Promise<PaymentIntentSnapshot>;
  findPaymentByAttempt(input: { connectedAccount; attemptId }): Promise<PaymentIntentSnapshot | null>;
  cancelPayment(input: { connectedAccount; paymentIntentId }): Promise<"canceled" | "not_cancelable">;
}
```

- `createPayment`: `paymentIntents.create` con `confirm: false`, `off_session: true`, `payment_method_types: [kind]`, `mandate` si SEPA, `description`, metadata de ids, `{ stripeAccount, idempotencyKey: "zaltyko-family-collection:{invoiceId}:{attemptNumber}:create" }`. Sin `application_fee_amount`, `on_behalf_of` ni `receipt_email`.
- `confirmPayment`: `paymentIntents.confirm(id, { off_session: true }, { stripeAccount, idempotencyKey: "…:{attemptNumber}:confirm" })`. Los errores de tarjeta vuelven como `CollectionError { code; declineCode; paymentIntent }`, no se lanzan.
- `findPaymentByAttempt`: búsqueda en la cuenta conectada por `metadata['zaltyko_collection_attempt_id']` (la búsqueda tarda unos segundos en reflejar los cobros nuevos; solo se usa en reanudaciones de más de 15 minutos).
- `PaymentIntentSnapshot = { id; status; lastErrorCode; lastDeclineCode }`. La moneda va en minúsculas solo aquí.
- Lectura de referencia, sin importarla: `src/lib/stripe/charge-collection-service.ts` (mapeo de errores).

- [ ] Tests con Stripe falso (parámetros y opciones exactos, claves de idempotencia, ningún dato personal, mapeo de errores, búsqueda). Implementar. Run. Commit.

### Task 4: Abrir el modo automático en el libro de cuotas

**Files:** `src/modules/billing/application/family-collection-preferences.ts`, `ledger-service.ts`, `monthly-invoice/issue.ts`, `monthly-invoice/issued-reads.ts`, `src/modules/shared/application/actor.ts`, `src/modules/payments-connect/application/connect-onboarding-service.ts`, la ruta `owner/billing/family-collection-preference`, y sus tests (incluidos los de caracterización que fijan el 409).

- **Preferencia:** `saveFamilyCollectionPreference` acepta `automatic` si la bandera está encendida, los cerrojos abiertos y el plan es de pago; si no, sigue el 409 `FAMILY_AUTOMATIC_COLLECTION_DISABLED`. `buildPreference` deja de devolver «siempre manual». `requireOrganizationWideScope` (`:70-102`) deja de dar 404 a una familia sin cuotas abiertas, para poder activar el cobro antes de la primera emisión.
- **Emisión:** el 409 de `issueInvoiceInTransaction` (`ledger-service.ts:596-602`) solo se mantiene para facturas no mensuales. `getChargeCollectionModeSnapshot` devuelve `automatic` solo si la factura es mensual, la preferencia es automática de la revisión de plan vigente, la familia tiene autorización activa en la cuenta de la academia y la bandera está encendida; si no, `manual`. `issue.ts:181` deja de forzar `manual` y `issue.ts:232` usa el modo real; los tipos literales `"manual"` de `issued-reads.ts:32/257` pasan a la unión.
- **Lecturas:** `loadMonthlyChargeState` deja de lanzar 500 con cargos automáticos (`issued-reads.ts:245-252`).
- **Día de cobro (P2):** servicio `getCollectionSettings` / `saveCollectionSettings` (owner o admin con todas las sedes, versión optimista, auditoría) y su ruta `PUT /api/v1/owner/payments/collection-settings`. Cambiar el día afecta a los cobros que aún no se han reclamado.
- **Libro, para la Tarea 5:** función exportada nueva `recordProviderCollectionPayment(tx, { organizationId, attemptId, invoiceId, paymentIntentId, amountCents, environment })` que inserta el pago `provider` (entorno `test` → `sandbox` del enum del libro; idempotente por `payments_provider_uq`) y **nunca** falla por saldos; y `allocateProviderCollectionPayment(tx, …)` que reparte lo que quepa y devuelve `allocated` | `needs_review` (cuota saldada o anulada, o importe que no cuadra). Comparte con el pago manual una comprobación «cuota con cobro automático en curso». Actor de sistema nuevo `jobKey: "zaltyko-family-collection"` en `systemActorSchema`.
- **Cuenta conectada:** función exportada `refreshConnectAccountForCollection(accountRowId)` que relee la cuenta y reutiliza `persistProjection` con `providerEventReference: null` (no inventa ids de evento; respeta la frescura de ADR-0022).

- [ ] Tests: bandera apagada = comportamiento idéntico (los de caracterización no cambian); con bandera, preferencia automática, emisión con y sin autorización activa, factura manual siempre manual, registro idempotente, reparto con cuota ya pagada → `needs_review`. Implementar. Run. Commit.

### Task 5: Servicio del proceso de cobro

**Files:** `src/modules/family-collection/infrastructure/family-collection-store.ts`, `application/family-collection-service.ts`, `tests/family-collection-service.test.ts`, amplía `tests/family-collection-pg.test.ts`.

**Produces:** `runFamilyCollection({ now?, deadlineMs?, batchSize? }, deps?)` → contadores `{ reconciled; collected; processing; failed; canceled; skipped: Record<reason, number>; retried; resumed; needsReview }`. Paginación por keyset y plazo de 240 s, como `payment-reminders/application/service.ts`.

**Fase A — poner al día lo que quedó a medias** (antes de cobrar nada nuevo):

1. Reanudar, tomándolos de forma atómica (`UPDATE … SET resume_count = resume_count + 1 WHERE status IN ('claimed','created') AND claimed_at < now() - 15 min AND resume_count < 3 RETURNING`):
   - `created` → `retrievePayment` del `pi_…` guardado; si sigue sin confirmar, `confirmPayment`.
   - `claimed` → `findPaymentByAttempt`; si existe, se guarda su id y se sigue como `created`; si no, se crea.
   - Con `resume_count = 3` y sin cobro en Stripe → `failed` `transient_exhausted`, sin reintento. Si hay cobro en Stripe, nunca se marca fallido: se aplica su estado.
2. Releer en Stripe los intentos `processing` (SEPA o tarjeta pendiente) y aplicar su estado final. La Fase 4 lo sustituye por eventos.

**Fase B — cobrar lo que vence hoy:**

1. **Selección:** facturas mensuales `issued`/`partially_paid` con cargos `automatic` abiertos y vencidos por fecha local, sin intento no terminal, y cuyo último intento no sea final (final = `succeeded`, `canceled`, o `failed` sin `next_retry_at`), o con `next_retry_at <= now`.
2. **Recarga y puerta** (sin transacción): organización, plan, preferencia, cargos, pagador vigente, autorización activa, Customer (de `family_payment_setup_attempts` con `authorization_id` = la autorización; exactamente una fila, si no `final`), cuenta. Si `last_synced_at` tiene más de 1 hora, `refreshConnectAccountForCollection` (una vez por academia y ejecución). `planInvoiceCollection` + `evaluateFamilyCollectionGate`.
   - Motivo `transient` → no se escribe nada; se reintenta mañana.
   - Motivo `final` → transacción corta (orden de bloqueo único) que escribe un intento `canceled` con `failure_code` = motivo. La cuota vuelve a manual y a los recordatorios.
3. **Reclamar** (transacción corta, orden de bloqueo único): se repite el plan con los datos bloqueados y se inserta el intento `claimed` (número = último + 1) con su reparto. Si el índice parcial salta, `skipped.concurrent`. Auditoría + outbox `family_collection.attempt_claimed`.
4. **Crear** en Stripe → guardar el `pi_…` y pasar a `created` (transacción corta).
5. **Confirmar** en Stripe.
6. **Aplicar** (transacción corta, orden de bloqueo único, intento `FOR UPDATE` en `claimed`/`created`; si no, nada):
   - `succeeded`, en dos pasos dentro de la misma transacción: primero `recordProviderCollectionPayment` e intento `succeeded` (no puede fallar por saldos); después `allocateProviderCollectionPayment`, que deja `allocation_status`. Si queda `needs_review`, outbox `family_collection.needs_review` para la academia.
   - `processing` → `processing` (lo cerrará la Fase A de un día siguiente o la Fase 4).
   - `failed` → `failed` con `code`, `decline_code` y `next_retry_at = nextRetry(…)`. Sin reintento → outbox `family_collection.final_failure`. En `authentication_required`, además `cancelPayment` como mejor esfuerzo.
   - `transient` → se queda en `created` o `claimed`; lo reanuda la Fase A.
   - `idempotency_conflict` → el intento se queda como está, con `logger.error` (solo ids) y aviso a la academia; nunca se crea otro cobro.

- [ ] Tests unitarios (cada rama; la puerta corta antes de reclamar; nada de Stripe dentro de transacciones; motivos `transient` frente a `final`). Tests pg:
  - tarjeta cobrada → cuotas y factura pagadas;
  - dos ejecuciones simultáneas → un intento y una sola creación;
  - caída tras confirmar y reanudación a las 25 h → cero creaciones nuevas y pago registrado;
  - cuota pagada a mano después de reclamar → pago registrado y `needs_review`;
  - pago parcial previo → solo el saldo;
  - autorización revocada o pagador cerrado antes del cobro → intento `canceled` y recordatorios;
  - reintento a los 3 días y fallo final;
  - SEPA `processing` que se cierra en la relectura.
- [ ] Implementar. Run. Commit.

### Task 6: Ruta cron y trabajo de pg_cron

**Files:** `src/app/api/cron/collect-family-fees/route.ts`, `tests/api-cron-collect-family-fees.test.ts`, `docs/deployment/scheduler/candidates/collect-family-fees.sql` (sin aplicar), README del planificador.

- `POST` (y `GET` = `POST`, como `family-payment-reminders`): `requireCronAuth`, `runCronWithLease("cron:collect-family-fees", …)`. Con la bandera apagada → `{ enabled: false }`, sin tocar la base. La respuesta solo lleva contadores.
- SQL de pg_cron solo documentado: `0 6 * * *` UTC (07:00 en Madrid en invierno, 08:00 en verano). `call_cron` tiene la URL de producción fija (`20261115_pg_cron_avisos.sql:23`): el documento explica cómo programar staging (una función o un parámetro de URL propios) sin tocar la de producción. Aplicarlo en cualquier entorno necesita autorización.

- [ ] Tests de la ruta (401, 503 sin secreto, lease ocupado, bandera apagada, contadores). Implementar. Run. Commit.

### Task 7: Carreras con el pago manual, cancelar y recordatorios

**Files:** `src/modules/billing/application/ledger-service.ts` (`recordManualPaymentForCharge`, `allocatePayment`), `src/modules/family-collection/application/family-collection-service.ts` (cancelar), ruta `POST /api/v1/owner/payments/automatic-collection` (`action: "cancel"`), `src/modules/payment-reminders/application/candidates.ts` y `domain/reminder-policy.ts`, tests.

- Pago manual o reparto sobre una cuota cuya factura tiene un intento `claimed`, `created` o `processing` → 409 `AUTOMATIC_COLLECTION_IN_PROGRESS` («Esta cuota se está cobrando automáticamente. Espera al resultado.»). Con un `failed` con reintento pendiente → el pago manual cancela ese reintento (`canceled`) en la misma transacción. La comprobación vive en la función común del reparto, así cubre `recordManualPaymentForCharge` y `allocatePayment`.
- La academia puede «Cancelar el cobro automático» de una factura con reintento pendiente (pasa a `canceled`). Con un cobro `processing` no se puede (SEPA ya enviado): 409 con texto claro.
- Recordatorios: una cuota `automatic` no recibe recordatorio mientras la bandera esté encendida y su factura no tenga un intento final; sí lo recibe tras el fallo final, la cancelación o un intento `canceled` por la puerta, y siempre que la bandera esté apagada. Razón de omisión nueva `automatic_collection`.

- [ ] Tests de cada caso, incluido el pg de pago manual concurrente con un cobro reclamado (sin bloqueo mutuo, por el orden único). Implementar. Run. Commit.

### Task 8: Pantallas

**Files:** `src/components/family-portal/FamilyFeesView.tsx` (+ lecturas), paneles de `src/components/owner-dashboard/` (pagos y el de Fase 2), `FamilyCollectionModeCard.tsx`, tests.

- **Familia (`/familia/cuotas`):** en cada cuota automática, «Se cobrará automáticamente el {fecha}», «Cobro en curso», «Cobrada automáticamente el {fecha}» o «No se pudo cobrar automáticamente; tu academia te dirá cómo pagarla». Sin códigos de Stripe.
- **Academia:**
  - en la tarjeta «Cobro automático de cuotas» de `/owner/settings` (Fase 1), el ajuste «Día de cobro»: «El día que vence cada cuota» (por defecto) o «Un día fijo del mes» con un selector 1–28 y la nota «Si ese día cae antes del vencimiento, se cobra el día del vencimiento»;
  - en «Pago automático de las familias» (Fase 2), un interruptor por familia «Cobrar automáticamente» (guarda la preferencia de la Tarea 4; solo con método activo);
  - en `/owner/payments`, los cobros automáticos del mes con su estado, el motivo en palabras sencillas si falló o se canceló, los que necesitan revisión, y «Cancelar el cobro automático» donde se pueda;
  - el formulario de pago manual explica por qué una cuota está bloqueada.
- `FamilyCollectionModeCard` (sin montar y con el automático fijado a «no disponible», `:46-53`): se retira o se reutiliza para el interruptor; nunca dos interruptores para lo mismo.

- [ ] Tests de componentes y lecturas. Implementar. Run. Commit.

### Task 9: Documentación

ADR-0028 (estado de la Fase 3, respuestas de P1–P3, decisiones nuevas), `docs/COBROS_Y_CUOTAS.md` (sección «Cobro automático de cuotas (Fase 3)» con los apartados de las fases 1 y 2), `.env.example` (`ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED=false`), README del planificador, vault (Changelog y Decisiones). Deuda: devoluciones, disputas, recuperación del 3DS y recibo en la Fase 4; `payment_attempts` canónica sin usar; el aviso previo SEPA depende de L4.

- [ ] Escribir. Run (`audit:env`). Commit.

### Task 10: Staging (necesita autorización de Elvis)

Aplicar la candidata en Supabase staging, encender la bandera en Vercel staging y programar el trabajo de pg_cron de staging. Recorrido con la cuenta sandbox «Lista para cobrar»:

- tarjeta `4242…` cobrada, con día de vencimiento y con un día fijo;
- `4000 0000 0000 9995` (saldo insuficiente) → reintento a los 3 días, adelantando `next_retry_at` en staging;
- `4000 0000 0000 9979` (robada) → fallo final sin reintento;
- `4000 0027 6000 3184` → «no se pudo cobrar» por autenticación;
- pago manual durante un cobro en curso → bloqueado;
- revocar el método antes del vencimiento → cuota a manual con recordatorio.

La domiciliación SEPA, con su cierre por relectura, solo cuando Elvis lo autorice.
