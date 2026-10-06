# ADR-0003 — Ledger financiero interno

- Estado: aceptada; implementación v1 cerrada localmente
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

## Criterios verificados localmente

- igualdad `sum(allocations) <= payment.amount`;
- estado de factura derivado de líneas, asignaciones y reembolsos;
- deduplicación de eventos de proveedor;
- pruebas de pagos parciales, fallo, reintento y refund;
- reconciliación por organización, moneda y período;
- cero llamadas a Stripe Live durante pruebas.

Resultado: todos los criterios anteriores pasan en PostgreSQL efímero. Esto no
es evidencia de runtime remoto ni de una entrega webhook firmada.

## Evidencia

- PRD, secciones 9.6, 10.6, 12.3 y AC-05/AC-06.
