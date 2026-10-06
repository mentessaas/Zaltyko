# Ledger financiero interno — operaciones canónicas

- Estado: implementado y verificado localmente
- Fecha: 2026-10-06
- Alcance: PR-04 del plan Owner Dashboard / Academy Health Score

## Fuente de verdad

El procesador confirma intentos, pagos y reembolsos, pero no define el estado
financiero de Zaltyko. La fuente de verdad es el ledger interno:

1. `invoices` + `invoice_lines` describen lo facturado.
2. Cada línea positiva produce un `charge`, la obligación cobrable.
3. `payments` registra dinero confirmado por el procesador.
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
- Solo `owner` y `admin` emiten facturas, asignan pagos o concilian períodos.
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
- `pnpm test:zaltyko-ledger-services:local`: pago parcial, intento fallido,
  reintento exitoso, refund, sobreasignación/sobrereembolso rechazados, tres
  entregas concurrentes con un efecto y conciliación exacta.

No se ha validado API HTTP, endpoint webhook real, firma Stripe, Stripe Test o
Live, impuestos, UI, E2E autenticado, despliegue ni producción.

## Dependencia siguiente

PR-05 puede consumir cargos, asignaciones, refunds y conciliaciones sin leer
Stripe ni recalcular operaciones. Impuestos, descuentos/becas y reconocimiento
por prorrateo permanecen fuera de v1 y deben entrar como nuevas reglas
versionadas, no como mutaciones retroactivas.
