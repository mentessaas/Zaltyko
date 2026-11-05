# Total de opciones de cuota con monedas mezcladas

## Hallazgo

Cuando una familia tiene líneas en más de una moneda, el builder conserva `currency: null` y añade `CURRENCY_MISMATCH`, pero la respuesta sumaba importes de monedas distintas en `totalAmountCents`. La interfaz y la emisión ya bloquean esa familia; este defecto de presentación no demuestra que se haya emitido ni cobrado una factura incorrecta.

**Fuente:** `src/modules/billing/application/monthly-invoice-service.ts`, agregado y mapeo de opciones; `src/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace.tsx`, tipo nullable y guard de emisión.

**Importancia:** evitar presentar como total comparable una suma de céntimos en monedas distintas, manteniendo visibles las líneas originales y el bloqueo existente.

## Cambio

La respuesta expone `totalAmountCents: null` solo si `blockingReasons` contiene `CURRENCY_MISMATCH`. Conserva las líneas, sus importes y monedas, el total numérico interno usado al calcular `quoteHash` y las guardas existentes. El flujo de emisión vuelve a construir las opciones y rechaza la familia bloqueada antes de llamar al servicio de inserción; la comprobación explícita de total nulo mantiene ese límite también en el tipo de respuesta.

## Pruebas añadidas

- Dos gimnastas de una misma familia con tarifa EUR y MXN: conserva ambas líneas, importes y monedas; devuelve total y moneda nulos, `CURRENCY_MISMATCH` y `canIssue: false`.
- Dos gimnastas con tarifas EUR: conserva la suma de 15.000 céntimos, EUR y `canIssue: true`.

- Regresión de servicio con PostgreSQL efímero en el harness financiero existente: segunda gimnasta sintética con tarifa MXN en la familia EUR, periodo sin factura, total nulo y líneas originales; emisión rechazada 422 y recuentos de siete tablas financieras inmutables en ambas academias. Añadida por coordinación; todavía sin ejecutar. El guard de loopback y los casos previos se conservan.

- Corrección de conexión a CI: ese harness financiero no es llamado por el `schema-replay` actual. Se añade el caso a `tests/billing-ledger-postgres.integration.test.ts`, que sí ejecuta el runner desechable: misma familia y clase, dos gimnastas con EUR 3.500 y MXN 2.500 céntimos, sin total combinado; rechazo 422 y recuentos **y hashes** inmutables de ocho tablas financieras en ambas academias. La academia de control tiene una cuota EUR emitida para evitar un control exclusivamente vacío. Los guards y el servicio no se modifican. Preparado, todavía sin ejecutar.

## Verificación y límites

Revisión estática del builder y de su uso por `issueMonthlyInvoice`. Pruebas y build no ejecutados localmente según la instrucción de esta tarea; quedan para QA/CI remotos. No se modificó fiscalidad, conversión, esquema, SQL de migración, proveedor, datos ni flujo Live. No hay evidencia en esta revisión de una factura incorrecta emitida o cobrada.

## Siguiente paso

Ejecutar la nueva regresión en QA/CI remotos. El cambio de producto ya está integrado en `527d4c2d`, que no es aprobable por fallos independientes de tipos y un selector de pruebas; la nueva regresión PostgreSQL aún no pertenece a un commit ejecutado. No está publicado en la preview ni en producción.
