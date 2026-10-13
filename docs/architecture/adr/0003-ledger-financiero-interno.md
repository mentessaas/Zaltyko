# ADR-0003 — Ledger financiero interno

- Estado: aceptada; ledger v1 local, operación manual inicial implementada
- Fecha: 2026-10-06
- Alcance: precios, facturas, cargos, pagos y reembolsos

## Decisión

Stripe será procesador, nunca la única fuente de verdad contable. El núcleo
separará:

- `price_plans` y asignaciones de precio a inscripción;
- `invoices` e `invoice_lines`;
- `charges` como obligaciones;
- `payments` como dinero recibido;
- `payment_allocations` para distribuir pagos parciales;
- `payment_attempts` como intentos del proveedor;
- `refunds` como reversos trazables.

Todas las cantidades se almacenan en unidades menores y moneda ISO 4217. Un
webhook solo produce un efecto si su identificador de proveedor y clave de
idempotencia no se procesaron antes. Los asientos financieros no se borran: se
revierten o corrigen con nuevas filas auditables.

## Implementación v1

La migración `20261006093047_add_internal_billing_ledger.sql` implementa las
entidades decididas, un inbox restringido de proveedor y reconciliaciones
materializadas. Los servicios transaccionales y su evidencia se documentan en
`docs/architecture/ledger-operations.md`.

No se integró Stripe ni otro proveedor remoto. El adaptador ejecutable es local
y sandbox; firma real, impuestos, descuentos y prorrateos permanecen fuera del
alcance de esta versión.

El ledger distingue pagos manuales (`source=manual`) de pagos confirmados por
proveedor (`source=provider`). `recordManualPayment` registra dinero que ya se
recibió fuera del procesador; no inicia cargos. Requiere actor financiero,
scope de organización/sede, fecha no futura, clave idempotente y escribe pago,
outbox y auditoría en una transacción. La referencia libre solo se conserva en
el asiento; la auditoría guarda su digest.

La ruta local owner/admin consulta cargos abiertos y registra el pago
directamente ligado a un cargo, incluida su asignación parcial, en la misma
transacción. La pantalla `/owner/payments` no inicia cobros. La API y su
formulario son una primera operación visible, no una configuración del modo de
cobro de la academia. El automático sigue bloqueado hasta implementar y
verificar entitlement de plan pagado, opt-in por academia,
mandato/consentimiento por pagador, autorización en worker, idempotencia,
webhooks firmados y pruebas de recuperación. Free/trial se mantienen manuales.

## Criterios verificados localmente

- igualdad `sum(allocations) <= payment.amount`;
- estado de factura derivado de líneas, asignaciones y reembolsos;
- deduplicación de eventos de proveedor;
- un pago manual sintético repetido tres veces produce un asiento, y un
  reintento con payload distinto se rechaza;
- pruebas de pagos parciales, fallo, reintento y refund;
- reconciliación por organización, moneda y período;
- cero llamadas a Stripe Live durante pruebas.

Resultado: los criterios de ledger y el registro manual pasan en PostgreSQL
efímero; tests de API HTTP pasan con autenticación simulada. La interfaz existe
localmente, pero no hay evidencia de walkthrough autenticado, runtime remoto,
despliegue ni entrega webhook firmada.

## Evidencia

- PRD, secciones 9.6, 10.6, 12.3 y AC-05/AC-06.
