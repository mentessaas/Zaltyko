# QA estática de aceptación internacional del núcleo — 2026-11-04

## Corte y límites

Revisión estática del worktree de main-bridge. La ruta física devuelta por pwd es `/Users/elvisvaldesinerarte/projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025`, rama `codex/mvp-main-bridge-20261025`, HEAD `3e2ad57f`. Los cambios y archivos nuevos que ya existían se conservaron. El código de Product Discovery y algunos cambios internacionales estaban sin seguimiento o modificados en este corte; estas notas describen el worktree, no una versión integrada.

No ejecuté pruebas, builds, CI, SQL, servicios locales ni consultas remotas. La aceptación ES/MX alojada y cualquier estado de lanzamiento siguen sin verificarse.

## Hallazgos

### P1 histórico — Periodo inicial por sede: corrección candidata, pendiente de CI

La revisión detectó primero un periodo inicial calculado con `Europe/Madrid`. En el worktree actual, `currentServicePeriod(timezone)` recibe la zona de la sede seleccionada; se conserva el periodo explícito de la URL y, si la zona falta o es inválida, la página falla cerrado con un aviso. La prueba candidata cubre Ciudad de México cerca del cambio de mes, Canarias, periodo explícito y zona inválida. No ejecuté la prueba, así que es corrección candidata, no PASS.

**Fuente:** [monthly-invoices/page.tsx](../../src/app/owner/monthly-invoices/page.tsx#L29), [owner-scope.ts](../../src/modules/owner-dashboard/application/owner-scope.ts#L20), [prueba de periodo por sede](../../tests/owner-monthly-invoices-page-period.test.tsx#L51).

**Importancia:** el valor inicial participa en el flujo manual de emisión de cuotas; una fecha civil equivocada puede preparar el periodo incorrecto.

**Siguiente paso:** conservar el fallo cerrado y cerrar la prueba en CI del SHA integrado. No tratar el hallazgo histórico como resuelto en una entrega hasta verificar ese gate.

### P1 — Moneda ausente: corrección candidata en el worktree, pendiente de CI

La revisión detectó fallbacks EUR en métricas e Insights. El worktree actual los reemplaza por “Moneda no disponible” y mantiene el código explícito cuando es MXN u otra moneda. Hay casos nuevos para `currency: null` y MXN en las pruebas de vista. No los ejecuté, así que la corrección queda candidata hasta CI del SHA que la contenga.

**Fuente:** [OwnerDashboardView.tsx](../../src/components/owner-dashboard/OwnerDashboardView.tsx#L69), [get-owner-dashboard.ts](../../src/modules/owner-dashboard/application/get-owner-dashboard.ts#L79), [InsightInbox.tsx](../../src/components/owner-dashboard/InsightInbox.tsx#L62), [caso null/MXN del dashboard](../../tests/owner-dashboard-view.test.ts#L6), [casos null/MXN de Insights](../../tests/owner-insight-inbox-command-retry.test.tsx#L89).

**Importancia:** la corrección evita etiquetar como EUR una fila sin código de moneda. No se ha acreditado aquí que existan filas mexicanas mal etiquetadas en un entorno real.

**Siguiente paso:** conservar el comportamiento y cerrar los nuevos casos en CI del candidato integrado. Mantener monedas históricas separadas, sin conversión ni suma cruzada.

### P2 — Timestamps de Owner e Insights se expresan en hora de Madrid

Las funciones de formato de OwnerDashboardView e InsightInbox fijan `Europe/Madrid`. OwnerScope y el bundle del dashboard no incluyen zona horaria de la sede para esas marcas temporales. El resumen operativo sí devuelve zona y modo por sede, un patrón reutilizable.

**Fuente:** [OwnerDashboardView.tsx](../../src/components/owner-dashboard/OwnerDashboardView.tsx#L59), [InsightInbox.tsx](../../src/components/owner-dashboard/InsightInbox.tsx#L52), [operational-summary.ts](../../src/modules/owner-dashboard/application/operational-summary.ts#L313).

**Importancia:** el mismo instante puede aparecer con una hora ajena a la sede mexicana. No cambia el instante almacenado, pero sí su lectura operativa.

**Siguiente paso:** exponer la zona seleccionada y formatear marcas temporales con ella; para agregados, conservar la semántica explícita por sede. No reinterpretar fechas civiles como instantes UTC.

### P2 — El formato visual usa locale de España, aunque la moneda del cargo es dinámica

ManualPaymentForm entrega la moneda del cargo a Intl y usa la zona horaria del cargo para recuperar la fecha civil. OwnerClassesManager y el panel operativo formatean fechas civiles con UTC al mediodía, evitando que cambie el día por conversión. El panel operativo separa importes por código de moneda. Estas rutas no son un fallback funcional a EUR; aun así, varios formateadores usan `es-ES`, cuyo separador y presentación no representan el locale mexicano.

**Fuente:** [ManualPaymentForm.tsx](../../src/components/owner-dashboard/ManualPaymentForm.tsx#L114), [OwnerClassesManager.tsx](../../src/components/owner-dashboard/OwnerClassesManager.tsx#L78), [OwnerOperationalSummaryPanel.tsx](../../src/components/owner-dashboard/OwnerOperationalSummaryPanel.tsx#L126).

**Importancia:** diferencia de presentación y lectura numérica, sin evidencia aquí de conversión o alteración del importe almacenado.

**Siguiente paso:** cuando el contrato de locale esté definido, aceptar un locale explícito por organización/usuario. No deducir idioma o formato fiscal solo del país.

## Matriz para la siguiente aceptación

| Área | Contrato que falta verificar | Evidencia necesaria |
| --- | --- | --- |
| Cuotas | Mes civil de la sede ES y MX; el query override prevalece | Casos alrededor de medianoche y fin de mes en zonas IANA distintas, más emisión manual revisada antes de confirmar |
| Moneda | EUR y MXN permanecen asociados a cada importe; nulo no se presenta como EUR | Fixtures separados EUR/MXN y caso de moneda ausente; ninguna suma o conversión cruzada |
| Dashboard e Insights | Marcas temporales en la zona seleccionada; importes con código explícito | Fixture de sede MX, transición horaria pertinente y filas sin currency |
| Clases y asistencia | Fechas civiles siguen siendo fechas civiles; instantes se muestran en hora de sede | Fecha de sesión, asistencia y vencimiento al cambiar de zona |
| Presentación | Locale explícito cuando exista contrato | Revisión visual ES/MX en móvil y escritorio, sin inferir reglas fiscales |

Los tests existentes de mensualidades y resumen usan principalmente EUR y Europe/Madrid; la lectura estática de `tests/owner-dashboard-view.test.ts`, `tests/owner-monthly-invoices-manager.test.tsx` y `tests/owner-operational-summary-panel.test.tsx` no encontró casos MXN. No ejecuté esas suites. La ausencia de caso no demuestra un defecto desplegado.

## Decisión QA

La preparación administrativa ES/MX no queda aceptada por esta revisión. Los dos hallazgos P1 tienen correcciones candidatas y pruebas presentes, pero pendientes de CI. Las marcas temporales de Owner e Insights siguen atadas a Madrid; falta evidencia del recorrido alojado de cuotas y pagos manuales en una sede mexicana.
