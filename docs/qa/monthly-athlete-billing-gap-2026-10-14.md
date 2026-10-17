# Auditoría y propuesta: cuota mensual por gimnasta y tarifa

- **Fecha:** 2026-10-14
- **Base auditada:** `4f10141af7d599269f0efe419c7c20e607acee13`
- **Rama:** `codex/monthly-per-athlete-billing-audit-20261014`
- **Alcance:** inspección estática de ADR, servicios, esquemas, rutas, UI y harness. No se ejecutaron pruebas ni consultas a bases de datos.
- **Estado:** diagnóstico y diseño para revisión; sin cambios de servicio, esquema ni migraciones.

## Resultado

La regla de producto es **una cuota mensual por gimnasta y tarifa**. Una tarifa puede cubrir explícitamente varias clases. Si las clases activas de una gimnasta resuelven a tarifas o snapshots distintos, la cotización debe bloquearse con un conflicto visible; no debe sumar cargos por enrollment ni elegir una tarifa arbitrariamente.

El servicio actual factura por enrollment. `QuoteLine` contiene un solo `enrollmentId`; la cotización agrega una línea cada vez que procesa un enrollment activo y suma sus importes. `issueMonthlyInvoice` pasa cada línea al ledger, que crea un `invoice_line` y un `charge` por entrada. Por tanto, dos clases recurrentes distintas con dos enrollments de una misma gimnasta pueden generar dos cuotas. [Servicio: tipo de línea](../../src/modules/billing/application/monthly-invoice-service.ts#L78), [construcción y suma](../../src/modules/billing/application/monthly-invoice-service.ts#L337), [emisión](../../src/modules/billing/application/monthly-invoice-service.ts#L981), [ledger](../../src/modules/billing/application/ledger-service.ts#L514).

La duplicación no depende del número de días de una clase: `class_template_weekdays` describe el horario de una plantilla, mientras que cada enrollment apunta a una plantilla. Una plantilla con varios días no crea por sí sola varios enrollments. [Plantillas y horarios](../../src/db/schema/zaltyko-core.ts#L1645), [enrollments](../../src/db/schema/zaltyko-core.ts#L1893).

La asignación financiera también está modelada por enrollment: `enrollment_price_assignments` guarda plan, importe snapshot, moneda y fechas para un único enrollment. No hay una relación de cobertura entre `price_plans` y las plantillas que una tarifa incluye. La cotización no agrupa por `athleteId`; solo bloquea mezcla de monedas en la familia, así que dos tarifas mensuales distintas en la misma moneda pueden sumarse hoy. [Asignaciones](../../src/db/schema/zaltyko-ledger.ts#L95), [planes y asignaciones en la cotización](../../src/modules/billing/application/monthly-invoice-service.ts#L239), [bloqueos y total](../../src/modules/billing/application/monthly-invoice-service.ts#L507).

## Protecciones actuales que deben conservarse

- Factura por **familia + sede + periodo**. La propuesta mantiene una cuota por gimnasta dentro de cada factura de sede; no agrega ni deduplica facturas entre sedes.
- Solo enrollments activos y asignaciones que cubren el mes completo. Se mantiene la relación familiar única, activa y vigente durante el periodo; no hay prorrateo.
- Pagador elegido explícitamente y vigente todo el mes. La fecha de vencimiento se convierte usando la zona horaria de la sede.
- Una moneda por factura. Una moneda incompatible debe bloquear la cotización, no mezclarse ni convertirse automáticamente.
- Cotización calculada por servidor, hash revisado bajo bloqueo, revalidación de familia/atletas/enrollments, emisión transaccional, replay idempotente, audit/outbox y `collection_mode=manual`.
- Historial append-only del ledger. Las líneas y pagos ya emitidos no se recalculan por cambios futuros de asignación o cobertura.

Estas reglas están descritas en [ADR-0026](../architecture/adr/0026-cuota-mensual-por-gimnasta-y-tarifa.md) y visibles en `monthly-invoice-service.ts`. El detalle de ADR-0026 que pide una línea por enrollment contradice la regla por gimnasta ya confirmada por el propietario; no edito esa ADR en este corte.

## Delta mínimo propuesto

1. **Cobertura de tarifa.** Añadir una relación tenant-aware y efectiva entre `price_plan` y `class_template`, por ejemplo `price_plan_class_template_coverage(organization_id, price_plan_id, class_template_id, starts_on, ends_on)`. La tarifa debe declarar qué plantillas cubre. La vigencia de cobertura debe abarcar todo el periodo mensual, igual que la asignación y el enrollment.

2. **Agrupar solo snapshots idénticos.** Mantener `enrollment_price_assignments` como fuente del importe versionado para cada enrollment. Dentro de familia+sede+periodo, agrupar los enrollments activos por gimnasta. Producir una línea únicamente si todos comparten el mismo `pricePlanId`, `unitAmountCents` y `currency`, y cada plantilla está cubierta por esa tarifa durante el mes. Dos planes o snapshots incompatibles producen `ATHLETE_TARIFF_CONFLICT`; una plantilla fuera de la cobertura produce `TARIFF_COVERAGE_INCOMPLETE`. No se emite una parte de la cuota mientras otra clase queda sin resolver.

3. **Contrato de cotización.** Cambiar `lines` de una línea por enrollment a una línea por gimnasta con `athleteId`, atleta, `pricePlanId`, importe, moneda y `coveredEnrollments: [{ enrollmentId, classTemplateId, className, assignmentId }]`. El cliente solo muestra esa cobertura; no elige enrollments ni importes. La huella incluye la tarifa, snapshots y conjunto ordenado de enrollments/plantillas cubiertos. La UI deja de decir “por inscripción” y explica las clases incluidas.

4. **Trazabilidad de factura.** Añadir `athlete_id` nullable a `invoice_lines` y una tabla hija como `invoice_line_enrollments` para conservar todos los enrollments y plantillas cubiertos por la línea, con snapshot legible de clase. Una nueva línea mensual usa un solo `invoice_line` y un solo `charge` por gimnasta; `invoice_lines.enrollment_id` queda nulo para el bundle y la tabla hija guarda el conjunto completo. Añadir unicidad de línea mensual por atleta dentro de factura/periodo. Las líneas históricas existentes conservan su `enrollment_id` y no se reescriben.

5. **Replay e historia.** Revalidar asignaciones y cobertura bajo el bloqueo actual; incluir atleta, tarifa y cobertura en el quote hash/outbox. Mantener el replay de facturas existentes y sus cargos/pagos como se emitieron; una cotización nueva no debe mutar ni reemitir una factura previa. No se incorpora cobro automático ni Stripe.

Este camino conserva el servicio actual de asignación por enrollment y evita crear ahora otro sistema de precios por atleta. Añade cobertura explícita al plan y una relación histórica para que una línea agrupada pueda explicar qué clases incluye.

### Propuesta de decisión para reconciliar ADR-0026

Sustituir la regla de «una línea por enrollment» por: «Para cada familia, sede y periodo mensual, se genera como máximo una línea por gimnasta y tarifa válida. La tarifa declara las plantillas cubiertas durante todo el periodo. Todas las clases activas de la gimnasta deben resolver a la misma tarifa, importe snapshot y moneda, y estar cubiertas; si no, la cotización queda bloqueada con el conflicto correspondiente. La línea conserva el conjunto de enrollments y clases cubiertos. Las facturas históricas no se recalculan».

La revisión debe decidir si se acepta esta redacción y el vínculo de cobertura por plantilla. Si se acepta, actualizar ADR-0026 y documentación funcional en un cambio posterior junto con el diseño de migración; esta propuesta no aprueba ni aplica esos cambios.

## Casos de aceptación y pruebas requeridas

| Caso | Resultado requerido |
| --- | --- |
| Una gimnasta, dos clases activas, misma tarifa y snapshots idénticos, cobertura incluye ambas | Una línea, un cargo, importe de la tarifa una sola vez; dos relaciones de cobertura. |
| Una plantilla con dos o más días semanales | Una línea/cargo; los días no multiplican la cuota. |
| Dos hermanas de la misma familia, cada una con una tarifa válida | Dos líneas y dos cargos dentro de la misma factura familiar. |
| Una gimnasta con dos `pricePlanId`, importes snapshot o monedas incompatibles | Cotización bloqueada con conflicto explícito; sin líneas parciales ni suma automática. |
| Una clase activa sin asignación, fuera de cobertura o con cobertura parcial de vigencia | Bloqueo explicable; no se cobra solo la otra clase. |
| Familia/sede/moneda/pagador/vencimiento | Se conservan los scopes y guardas existentes; fecha sigue usando zona horaria de sede. |
| Cambio en tarifa, importe, vigencia o conjunto de clases entre cotización y emisión | `QUOTE_STALE`; no se emite desde hash viejo. |
| Emisión concurrente, replay de misma clave y replay tras pago manual | Una factura y un cargo por gimnasta; mismos cargos/pagos al replay, sin duplicados. |
| Histórico emitido bajo el modelo actual | Mismas líneas, importes, moneda, pagador y estado; ninguna migración de datos reescribe el ledger. |
| Aislamiento tenant/sede/rol y tarifa de otra organización | Sin acceso ni cotización cruzada; la cobertura usa FKs tenant-aware y RLS/grants del dominio. |

Focal futuro: pruebas puras de agrupación/bloqueos, contrato de GET/POST, componente Owner, harness PostgreSQL para dos clases de una atleta/dos hermanas/conflicto de tarifa y replay concurrente. Repetir también los casos actuales de cotización obsoleta, pagador, vigencia, moneda, sede y pago manual. El recorrido E2E autenticado continúa siendo un gate independiente.

## Estado y límites

La auditoría previa [mensual-athlete-versus-enrollment](./monthly-athlete-versus-enrollment-2026-10-14.md) ya observaba el cobro por enrollment, pero dejaba la decisión de producto abierta. La instrucción vigente resuelve esa pregunta a favor de una cuota por gimnasta y tarifa. El detalle por enrollment de ADR-0026 queda pendiente de reconciliación después de revisar este diseño.

En esta rama solo se prepara este documento y el registro operativo del hallazgo. No se modificó `monthly-invoice-service`, ledger, API, UI, esquema Drizzle, migraciones ni bases de datos. No se ejecutaron tests; la evidencia aquí es inspección estática del código en el HEAD indicado.
