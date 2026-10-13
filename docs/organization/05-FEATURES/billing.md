# Facturación y cobros

Actualizado: 14 de octubre de 2026
Alcance: arquitectura greenfield de Zaltyko; estado observado en la rama local
`codex/mvp-monthly-billing-local-e2e-20261013`.

## Dos flujos financieros distintos

1. **Suscripción SaaS:** lo que Zaltyko cobra a una academia por su plan. El
   catálogo de producto está en [`src/lib/plans/catalog.ts`](../../../src/lib/plans/catalog.ts).
2. **Ledger familiar de la academia:** cuotas que la academia asigna a familias,
   dinero que ya recibió y, en el futuro, posibles cobros por procesador.

Una integración existente con Stripe o un endpoint heredado no demuestra que
el flujo greenfield esté listo para cobrar en producción. En este corte no se
ha verificado Stripe Test, Stripe Live, Connect, webhooks reales, provisioning
SaaS ni la asociación del Preview con una base válida.

## Cuota mensual por gimnasta y tarifa

La decisión de producto es emitir una factura mensual por **familia + sede +
periodo**, con una línea por cada inscripción activa que cumpla los requisitos.
Cada importe procede de la asignación de tarifa efectiva para esa inscripción;
el servidor calcula líneas, moneda y total. Varias gimnastas de la familia
pueden aparecer en la misma factura.

- Se factura el mes completo, sin prorrateo. Solo entra una inscripción activa
  que cubra el mes entero; una inscripción pendiente o con periodo incompleto
  bloquea la emisión hasta resolverla.
- Cada gimnasta debe tener una relación familiar vigente durante todo el mes y
  una única tarifa mensual efectiva que cubra el periodo completo. Faltas,
  solapamientos, tarifas cero o monedas mezcladas bloquean la cotización; no se
  inventa un importe.
- La persona pagadora se elige explícitamente entre las pagadoras vigentes de
  la familia. La fecha de vencimiento también es explícita y se convierte con
  la zona horaria de la sede.
- El navegador envía el identificador de familia/pagador, periodo, vencimiento,
  huella de cotización e idempotency key. Nunca decide importes ni líneas. El
  servidor vuelve a cotizar bajo bloqueo transaccional; una cotización obsoleta
  devuelve conflicto y debe actualizarse.
- Hay como máximo una factura no anulada para esa familia, sede y mes. La
  emisión es idempotente y escribe factura, líneas, cargo pendiente, auditoría
  y outbox en la transacción.
- La emisión v1 crea un cargo `due` con modo `manual`. No registra que el dinero
  se haya recibido, no crea un intento de proveedor y no inicia un cobro.
  Registrar un pago manual es una acción posterior y separada.

## Estado implementado localmente

- Pantalla Owner: `/owner/monthly-invoices`, accesible desde Pagos, con
  selección de mes/sede y vista previa por familia, persona pagadora y bloqueos
  explicados.
- Opciones: `GET /api/v1/owner/billing/monthly-invoices/options`.
- Emisión: `POST /api/v1/owner/billing/monthly-invoices/issue`.
- Alta de tarifa: `POST /api/v1/owner/billing/price-plans`, con nombre,
  importe positivo en unidades menores (máximo `2_147_483_647`), sede y
  academia; moneda opcional, por defecto la de la academia. Requiere
  `Idempotency-Key`. Crea una tarifa mensual activa; no la asigna ni cobra.
- Registro de dinero ya recibido: `POST
/api/v1/owner/billing/manual-payments`.
- Solo Owner/Admin con alcance financiero autorizado puede consultar o emitir.
  Las rutas autentican en servidor, resuelven scope de organización/sede,
  limitan frecuencia y responden `private, no-store`.
- `organization_id`, `location_id`, pagador, membresías, inscripciones y tarifas
  se revalidan en servidor/BD. Idempotencia, historial, audit log y outbox no
  dependen del estado de React.
- Las opciones de facturas existentes se limitan a la sede consultada.
  Reintentar una emisión después de pagar devuelve los estados actuales de
  cada cargo y el resumen (`due`, `partially_paid`, `paid`, `void` o `mixed`);
  no devuelve siempre `due`, ni añade cargos/pagos o altera el ledger.

El cierre backend integrado en `e465abc9` tiene 10 tests de API/validación
aprobados en la integración. El agente backend reportó además su harness
PostgreSQL con sedes/tenants, cotización obsoleta, concurrencia y replay tras
pago aprobado. Esta evidencia no sustituye el E2E de navegador ni demuestra
Stripe Live o readiness de lanzamiento.

Las pruebas focales locales de este corte pasan: 7 archivos, 23 tests,
TypeScript y ESLint de aplicación. La build de producción local completó durante
el ensayo del harness. El E2E autenticado no quedó verde: el navegador no llegó
a Auth de forma reproducible; por tanto, la interfaz de emisión no tiene aún un
recorrido autenticado demostrado. No se modificó Supabase remoto ni se usaron
datos reales.

## Cobro automático: futuro opcional, no disponible

Manual es el comportamiento efectivo para todas las academias en este corte.
El modelo admite una preferencia futura, pero una preferencia no es mandato,
consentimiento del pagador ni permiso para iniciar un cargo. Free y trial nunca
pueden activar el automático. Los planes de pago solo podrán solicitarlo cuando
se hayan superado los gates de plan efectivo, pagador autorizado, consentimiento
y mandato revocables, procesador y capacidad verificados, prevención de carreras
manual/automático, SCA, idempotencia, webhooks firmados, reintentos seguros,
conciliación, soporte, seguridad y release autorizado.

No activar Stripe Live ni usar credenciales o datos de producción como parte de
las pruebas. Una preferencia o snapshot de modo jamás ejecuta un pago. Ver
[ADR-0020](../../architecture/adr/0020-modalidad-de-cobro-y-entitlement-saas.md),
[ADR-0022](../../architecture/adr/0022-cuenta-conectada-de-cobro-por-academia.md),
[ADR-0026](../../architecture/adr/0026-cuota-mensual-por-gimnasta-y-tarifa.md)
y el [ledger financiero](../../architecture/ledger-operations.md).

## Fuentes de producto

- Catálogo SaaS: `src/lib/plans/catalog.ts`.
- Implementación de cotización/emisión: `src/modules/billing/application/monthly-invoice-service.ts`.
- Contratos HTTP: `src/app/api/v1/owner/billing/monthly-invoices/`.
- Plan por fases y release gates: [`docs/plans/2026-10-13-full-saas-implementation-plan.md`](../../plans/2026-10-13-full-saas-implementation-plan.md).
