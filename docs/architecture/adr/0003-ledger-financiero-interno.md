# ADR-0003 — Ledger financiero interno

- Estado: aceptada; implementación pendiente
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

## Límite de esta entrega

Solo se crea `price_plans`, porque una inscripción necesita una referencia de
precio estable. No se crean tablas de ledger hasta implementar juntas sus
invariantes, reconciliación e integración transaccional.

## Criterios antes de integrar el ledger

- igualdad `sum(allocations) <= payment.amount`;
- estado de factura derivado de líneas, asignaciones y reembolsos;
- deduplicación de eventos de proveedor;
- pruebas de pagos parciales, fallo, reintento y refund;
- reconciliación por organización, moneda y período;
- cero llamadas a Stripe Live durante pruebas.

## Evidencia

- PRD, secciones 9.6, 10.6, 12.3 y AC-05/AC-06.
