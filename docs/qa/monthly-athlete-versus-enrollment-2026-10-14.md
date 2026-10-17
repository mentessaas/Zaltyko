# Auditoría: cuota mensual por gimnasta o por inscripción

- **Fecha:** 2026-10-14
- **Checkout:** `codex/mvp-monthly-billing-backend-20261013`
- **HEAD auditado:** `aafab6ad118e5436288a2a8f844ff2def92a1b88`
- **Alcance:** lectura de ADR, servicios, esquema, interfaz y pruebas financieras locales. No se modificaron código ni migraciones. No se consultó producción.

## Hallazgo principal

El comportamiento implementado cobra **una tarifa por inscripción activa a una plantilla de clase**, no una tarifa única por gimnasta. Si una gimnasta tiene dos inscripciones abiertas en dos plantillas distintas durante el mes, la cotización crea dos líneas y el ledger crea dos cargos. Si una plantilla tiene varios días semanales, una sola inscripción a esa plantilla genera una sola línea: la cotización no cuenta días ni sesiones.

La regla escrita en ADR-0026 ya dice «una línea por cada inscripción elegible» y asigna el precio a esa inscripción. La ambigüedad está entre el título/contexto «por gimnasta» y ese detalle operativo, y en la expectativa comercial expresada en el encargo actual. Por tanto, esto es una **decisión de producto por confirmar**, no un incumplimiento demostrado de la regla detallada de ADR-0026.

## Hechos verificados

### 1. Clase recurrente, grupo e inscripción son relaciones distintas

ADR-0002 define `class_templates` como recurrencia semanal y `sessions` como ocurrencias; un atleta puede tener una inscripción fechada por plantilla. La unicidad de inscripción abierta está definida por `(organization_id, athlete_id, class_template_id)`: impide duplicar una misma plantilla, pero permite que la misma gimnasta se inscriba en plantillas distintas. [ADR-0002, líneas 18–24](../architecture/adr/0002-inscripcion-y-pertenencia-a-grupos.md#L18)

Una plantilla admite varias filas de `class_template_weekdays`, con unicidad por plantilla+día+hora. La cotización mensual no consulta esta tabla: carga las inscripciones por sede/periodo. Por eso, añadir un segundo día a la misma plantilla no multiplica la cuota; crear otra plantilla y otra inscripción sí puede hacerlo. [Esquema de días semanales](../../src/db/schema/zaltyko-core.ts#L1734), [carga de inscripciones mensuales](../../src/modules/billing/application/monthly-invoice-service.ts#L170), [unicidad por atleta+plantilla](../../src/db/schema/zaltyko-core.ts#L1937)

La asignación M:N atleta↔grupo tampoco determina el cobro. ADR-0002 la mantiene separada de la inscripción atleta↔plantilla. La cotización se construye desde `enrollments`, sus asignaciones de tarifa y la relación familiar, no desde grupos o días de clase. [ADR-0002, líneas 16–24](../architecture/adr/0002-inscripcion-y-pertenencia-a-grupos.md#L16)

### 2. La asignación de precio está anclada a cada inscripción

`enrollment_price_assignments` lleva `enrollment_id`, tarifa, importe snapshot, moneda y fechas; el índice parcial permite una sola asignación abierta por inscripción. La operación de asignación valida la inscripción y el plan mensual activo, cierra la asignación anterior y crea la nueva. [Esquema de asignaciones](../../src/db/schema/zaltyko-ledger.ts#L96), [validación de plan y fechas](../../src/modules/enrollments/application/enrollment-price-service.ts#L147)

La cotización busca asignaciones por cada `enrollmentId`. Exige exactamente una asignación que cubra el mes entero; falta, solapamiento o cambio de tarifa dentro del mes bloquea la emisión. No hay prorrateo. [Agrupación por inscripción y validación de periodo](../../src/modules/billing/application/monthly-invoice-service.ts#L239), [reglas de cobertura](../../src/modules/billing/application/monthly-invoice-service.ts#L337), [ADR-0026](../architecture/adr/0026-cuota-mensual-por-gimnasta-y-tarifa.md#L19)

La cotización añade una línea por cada inscripción elegible, ordenada por ID de inscripción; el total suma los importes de esas líneas. No agrupa ni deduplica por `athleteId`. [Construcción de líneas](../../src/modules/billing/application/monthly-invoice-service.ts#L424), [total y huella](../../src/modules/billing/application/monthly-invoice-service.ts#L507)

### 3. Cada línea genera un cargo separado

`issueMonthlyInvoice` pasa todas las líneas a `issueInvoiceInTransaction`. El ledger inserta un `invoice_line` y un `charge` por cada línea recibida. Así que dos inscripciones de la misma gimnasta producirían dos líneas y dos obligaciones pendientes. [Emisión por línea](../../src/modules/billing/application/monthly-invoice-service.ts#L1007), [bucle de líneas y cargos](../../src/modules/billing/application/ledger-service.ts#L514)

La factura agrupa por familia+sede+periodo. Hay una comprobación transaccional de factura existente y otra de que las inscripciones de la cotización no hayan sido facturadas en el periodo. Esto protege reintentos y duplicados técnicos de una misma inscripción, pero no impone unicidad por atleta/mes. La tabla `invoice_lines` no contiene una restricción única por atleta ni por inscripción+periodo; la segunda defensa está en el servicio. [Consulta existente por familia+sede](../../src/modules/billing/application/monthly-invoice-service.ts#L887), [guard de inscripción ya facturada](../../src/modules/billing/application/monthly-invoice-service.ts#L981), [índices de `invoice_lines`](../../src/db/schema/zaltyko-ledger.ts#L238)

La vista Owner muestra cada línea con nombre de gimnasta, nombre de tarifa e importe, pero no muestra la plantilla/clase. Dos líneas de la misma atleta podrían aparecer con el nombre repetido y ser difíciles de explicar si usan la misma tarifa. [Render de líneas](../../src/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace.tsx#L574)

### 4. Transferencias y pruebas

La transferencia cierra la inscripción de origen y crea otra para la plantilla destino. Copia `pricePlanId` como puntero, pero la asignación mensual se consulta desde `enrollment_price_assignments`; el destino necesita una asignación efectiva propia para entrar en una cotización. [Creación de inscripción destino](../../src/modules/enrollments/application/enrollment-service.ts#L759)

El harness sintético actual cubre dos gimnastas de una familia, dos líneas/cargos, cotización obsoleta, emisión concurrente y replay tras pago. No encontré un caso que compare explícitamente **una atleta en dos plantillas** frente a **una plantilla con dos días semanales**. Los tests de API de facturación mensual son principalmente de contrato/ruta. [Harness: preparación de cuotas](../../scripts/verify-zaltyko-operational-services.ts#L1182), [harness: líneas y cargos](../../scripts/verify-zaltyko-operational-services.ts#L1328), [tests de API](../../tests/monthly-invoice-api.test.ts)

## ¿Es un doble cobro?

- **No es un duplicado técnico demostrado** si la regla deseada es pagar por inscripción/plantilla: cada inscripción tiene una tarifa asignada, una línea y un cargo; replay o repetir la misma inscripción no debe generar otro cargo.
- **Sí puede ser una cuota duplicada desde el punto de vista comercial** si una cuota mensual por gimnasta debe cubrir varias clases/plantillas. El sistema no tiene una regla ni una clave de idempotencia por `athleteId + mes` que agregue esos casos.
- **También requiere decidir el alcance de sede** si la cuota es por gimnasta global: hoy las facturas son por familia+sede+periodo, de modo que clases en dos sedes pueden producir facturas distintas. No está demostrado que la academia quiera una cuota compartida entre sedes.

## Propuesta mínima según cada decisión

| Decisión de producto                             | Comportamiento                                                                                                                                            | Cambio mínimo y pruebas necesarias                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tarifa por clase/plantilla (por inscripción)** | Una gimnasta en dos plantillas elegibles genera dos líneas y dos cargos. Varios días/sesiones dentro de una plantilla generan uno.                        | Mantener la aritmética actual. Aclarar ADR, copy y vista previa como «por inscripción/plantilla» y mostrar la clase en cada línea. Añadir prueba con la misma atleta en dos plantillas (dos líneas/cargos) y otra con una plantilla en dos días (una línea/cargo). Probar además tarifas distintas por plantilla, cambios dentro del mes bloqueados y transferencia con nueva asignación.                                                                                                                                                                                                                                                                                                                                    |
| **Cuota bundle por gimnasta**                    | Una gimnasta con una o varias inscripciones elegibles genera una sola cuota mensual; hermanos siguen generando una cuota cada uno en la factura familiar. | Definir una asignación mensual a nivel de atleta, sede (o alcance entre sedes) y periodo; no elegir una tarifa arbitrariamente entre las tarifas de sus inscripciones. Agrupar elegibilidad por atleta y conservar la trazabilidad de todas las inscripciones cubiertas. El esquema actual de línea/cargo enlaza una inscripción, no un bundle de inscripciones, por lo que para trazabilidad íntegra probablemente haga falta un modelo de detalle o vínculo nuevo. Añadir pruebas: misma atleta en dos plantillas = una línea/cargo; dos días en una plantilla = una línea/cargo; dos hermanas = dos líneas/cargos; actualización de tarifa y transferencia; mismo atleta en sedes distintas conforme al alcance decidido. |

En ambos casos, conservar cotización servidor-side, idempotencia, bloqueo transaccional, moneda única, ventana mensual completa y registro manual separado. No convertir una tarifa de grupo histórica o una selección del navegador en autoridad de cobro sin una decisión y un vínculo canónico.

## Decisión pendiente / no verificado

**No verificado:** qué quiso decir el usuario por «mensual por gimnasta/tarifa» en el caso concreto de una misma gimnasta inscrita en dos clases distintas. Tampoco se ha fijado si una cuota por atleta sería por sede o común a varias sedes.

Pregunta de cierre propuesta: **si una gimnasta entrena en dos clases recurrentes distintas durante el mismo mes, ¿la familia debe pagar una tarifa por cada clase o una sola tarifa mensual que cubra ambas?** Si es una sola, aclarar cómo se elige el bundle cuando las clases tienen tarifas diferentes y si la cuota se comparte entre sedes.

No modificar esquema ni servicios hasta resolver esas decisiones. Este hallazgo no bloquea el flujo de login; la ejecución de UI autenticada sigue siendo un gate separado del QA de facturación.
