# Ledger financiero interno — operaciones canónicas

- Estado: registro manual y preferencia de modalidad en UI/API; sin cobro automático
- Fecha: 2026-10-13
- Alcance: PR-04 del plan Owner Dashboard / Academy Health Score

## Fuente de verdad

El procesador confirma intentos, pagos y reembolsos, pero no define el estado
financiero de Zaltyko. La fuente de verdad es el ledger interno:

1. `invoices` + `invoice_lines` describen lo facturado.
2. Cada línea positiva produce un `charge`, la obligación cobrable.
3. `payments` registra dinero recibido manualmente o confirmado por el
   procesador; `source` y sus campos condicionados distinguen ambos orígenes.
4. `payment_allocations` aplica dinero a cargos; permite pagos parciales.
5. `refunds` referencia una asignación concreta para atribuir el reverso al
   período correcto.
6. `financial_reconciliation_runs` materializa sumas reproducibles por
   organización, moneda y período.

Los importes están en unidades menores enteras. Las monedas no se mezclan y
ninguna fila financiera se elimina para corregir un estado.

## Invariantes transaccionales

- `sum(allocations por payment) <= payment.amount_cents`.
- `sum(allocations por charge) <= charge.amount_cents`.
- `sum(refunds por allocation) <= allocation.amount_cents`.
- Pago, cargo, asignación y refund deben pertenecer al mismo tenant y moneda.
- Solo `owner` y `admin` emiten facturas, registran/asignan pagos o concilian
  períodos.
- Factura y cargo derivan `partially_paid`/`paid` de las asignaciones, no del
  estado externo del procesador.
- Un refund reduce recaudación neta, pero no reabre automáticamente la deuda.
  En v1: `outstanding = expected - gross allocations`.

## Inbox de proveedor

`payment_provider_events` es un inbox restringido. El contrato actual acepta
solo un adaptador local `sandbox`, payload estricto y `signature_verified =
true`; no contiene SDK, llamadas de red ni claves de Stripe. Una integración
real deberá verificar la firma sobre el cuerpo raw antes de invocar el servicio.

La identidad `(processor, environment, provider_event_id)` es única. Repetir el
mismo evento devuelve el efecto previo; reutilizar el identificador con otro
payload produce `IDEMPOTENCY_CONFLICT`. El vocabulario externo se traduce al
dominio:

| Proveedor           | Dominio                  |
| ------------------- | ------------------------ |
| `payment.failed`    | `payment.attempt_failed` |
| `payment.succeeded` | `payment.succeeded`      |
| `refund.succeeded`  | `payment.refunded`       |

Los eventos y auditoría contienen identificadores técnicos, importes, moneda y
estado; excluyen nombre, email, teléfono, dirección, token y secretos.

## Registro de pago manual

`recordManualPayment` registra un pago que la academia ya recibió en efectivo,
por transferencia, terminal u otro medio. `recordManualPaymentForCharge`
implementa la operación de propietario completa: valida actor, organización y
sede, cargo abierto y moneda; rechaza fechas futuras y sobrepagos, y escribe
pago, asignación, estado derivado, outbox y auditoría en una transacción. Las
claves idempotentes concurrentes devuelven el mismo resultado; reutilizarlas
con datos distintos se rechaza. Si hay referencia, el asiento puede conservarla
para conciliación; la entrada de auditoría solo conserva su digest.

`GET /api/v1/owner/billing/manual-payments` lista cargos abiertos dentro del
scope permitido para owner/admin. `POST` registra el pago ya recibido; la vista
`/owner/payments` ofrece un formulario corto con importe pendiente precargado y
permite pagos parciales. El formulario advierte que no inicia un cobro. Junto
al cargo se guarda la modalidad preferida de esa familia: `manual` por defecto
o `automatic` solo con entitlement de pago vigente. La preferencia usa CAS por
versión e idempotencia, y registra actor, auditoría y outbox en una transacción.
La UI no expone el control si el actor no tiene acceso a todas las sedes, porque
la preferencia es familiar y no está limitada a un único cargo/sede.

Al emitir cargos, se guarda un snapshot de la preferencia únicamente si el
entitlement sigue vigente y su revisión coincide con la guardada por la
familia. Los cargos anteriores no cambian. Un downgrade invalida solicitudes
automáticas previas; volver a un plan pagado requiere confirmación expresa.

Validación local sintética: reintentos concurrentes iguales producen un pago y
una asignación; clave con payload distinto, sobrepago, sede no autorizada y rol
manager se rechazan. Tests HTTP con autorización simulada cubren contrato y
denegación de actor falsificado. La UI aún requiere walkthrough autenticado y
QA de accesibilidad en navegador.

La selección automática es todavía una preferencia, no una operación de cobro:
la UI/API siempre devuelve `effectiveMode: manual`, y el runtime está
deshabilitado. Free/trial no pueden solicitarla. `organization_saas_subscriptions`
es la proyección de proveedor; `organization_entitlements` es la autoridad del
plan efectivo y `organization_entitlement_changes` conserva revisiones
append-only. Las organizaciones nuevas reciben Free; las existentes sin
entitlement fallan cerradas. `family_payment_authorizations` solo reserva
referencias restringidas para un futuro flujo de mandato/consentimiento y no
está poblada ni operativa; ahora cada registro debe enlazar mediante FK
tenant-aware a `organization_payment_provider_accounts`. Esta proyección
separa la cuenta Connect de la academia de la cuenta que factura la suscripción
de Zaltyko, con una fila por academia/procesador/entorno. La decisión v1 fija
Connect Accounts v2, cargos directos, dashboard Stripe completo y Stripe como
recaudador de sus tarifas y responsable de saldos negativos (ADR-0022). Su
disponibilidad para la cuenta de plataforma de Zaltyko sigue **NO VERIFICADO**.

La elegibilidad de dominio ahora recibe el estado server-loaded de la cuenta y
exige tenant, entorno, modelo de API v2, cargo directo, estado activo y
capacidad `card_payments=active`; la autorización debe apuntar a esa misma
cuenta. Sigue exigiendo plan/revisión, preferencia familiar, snapshot del
cargo, tenant/pagador, consentimiento, vigencia y release del runtime. El
inbox y el worker de webhooks reales aún deben validar y persistir la identidad
de la cuenta conectada antes de producir efectos en el ledger. Tampoco se
impone todavía edad máxima a `last_synced_at`; la frescura del estado Connect
es un gate pendiente antes de liberar el worker. El cron legacy no satisface
estos requisitos y permanece fuera de este flujo.

## Reconciliación v1

El período se atribuye por `charge.service_period_start`. Con un watermark:

- `expected = sum(charges no void)`;
- `allocated = sum(payment_allocations)`;
- `refunded = sum(refunds succeeded)`;
- `net_collected = allocated - refunded`;
- `outstanding = expected - allocated`.

Caso de aceptación: cargo 100 €, pago asignado 60 € y refund 10 € producen
esperado 100 €, recaudado neto 50 € y pendiente 40 €.

## Evidencia local

- `pnpm test:zaltyko-ledger-foundation:local`: migración desde cero, RLS
  forzado, grants mínimos, FK cross-tenant, moneda y deduplicación.
- `pnpm test:zaltyko-ledger-services:local`: pago manual idempotente, pago
  parcial, intento fallido,
  reintento exitoso, refund, sobreasignación/sobrereembolso rechazados, tres
  entregas concurrentes con un efecto y conciliación exacta.
- `pnpm test:zaltyko-family-collection:local`: migración desde cero, seed Free,
  historial append-only, preferencia por familia, downgrade/reconfirmación,
  snapshot de cargo, RLS/grants, FK tenant-aware y referencias sintéticas.
- `tests/family-collection-eligibility.test.ts`: Free/prueba, cambio de tenant,
  cargo manual, proveedor ausente, consentimiento incompleto/revocado/vencido y
  runtime no liberado son denegaciones explícitas.

La ruta HTTP se valida con mocks de autenticación; no se ha completado E2E
autenticado ni walkthrough de UI. No se ha validado endpoint webhook real,
firma Stripe, Stripe Test o Live, impuestos, provisioning verificado del plan,
procesador automático, despliegue ni producción.

## Dependencia siguiente

PR-05 puede consumir cargos, asignaciones, refunds y conciliaciones sin leer
Stripe ni recalcular operaciones. Impuestos, descuentos/becas y reconocimiento
por prorrateo permanecen fuera de v1 y deben entrar como nuevas reglas
versionadas, no como mutaciones retroactivas.
