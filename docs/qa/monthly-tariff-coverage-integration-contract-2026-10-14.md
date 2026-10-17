# Contrato de integración: tarifa mensual con clases incluidas

Fecha: 2026-10-14. Decisión de implementación de ADR-0026, no evidencia de release.

## Alta atómica

`POST /api/v1/owner/billing/price-plans` conserva academia, sede, nombre, importe
en céntimos y moneda. Añade el objeto obligatorio `coverage`:

```json
{
  "classTemplateIds": ["UUID de clase seleccionada explícitamente"],
  "startsOn": "2026-11-01",
  "endsOn": null
}
```

De una a cien clases distintas, todas activas y pertenecientes a la academia y
sede autorizadas. Fechas válidas y ordenadas. No se presupone que una tarifa
cubra todas las clases. Crear plan, cobertura, auditoría y outbox es una sola
transacción y una acción de guardado en la UI. La idempotencia normaliza el
orden de IDs; cambiar selección o fechas con la misma clave responde conflicto.
El servidor controla importes, actor y scope. Una vigencia parcial puede
guardarse, pero no permite emitir un mes completo sin cobertura suficiente.

## Opciones para la selección

`GET /api/v1/owner/price-plans/options` mantiene `items` para consumidores
existentes y añade `organizationId`, `locationId`, `classTemplates` con
`id`, `name`, `effectiveFrom`, `effectiveTo` y `classTemplatesHasMore`.
Las clases se filtran por tenant, sede y estado activo. Devuelve hasta cien;
el indicador de truncado distingue catálogo parcial de completo.
Las tarifas seleccionables requieren cobertura explícita de esta sede; una
tarifa creada en otra sede no oculta la acción de crear la primera tarifa local
ni se presenta como asignable por pertenecer solo a la misma organización.
La UI rechaza respuestas de otro ámbito. Errores o ausencia de clases no
se convierten en opciones inventadas ni en selección automática.

## Ownership y gates

- Backend: servicio y POST de alta, pruebas API/servicio y harness transaccional.
- Frontend: panel de resolución y pruebas de selección/fechas/retry/accesibilidad.
- Main: opciones GET, contrato, integración y revisión independiente.
- QA: allowlist local y E2E solo después de integrar los tres consumidores.

El esquema, servicio por atleta, alta atómica de cobertura y formulario están
integrados localmente en `120d90ed` (Backend `355c310e`, Front `2915e314`).
Main verificó 71 tests focales integrados y TypeScript PASS. La prueba
transaccional independiente pasó tras corregir una expectativa no determinista:
el command ganador de dos emisiones simultáneas puede tener cualquiera de sus
claves. La prueba identifica la clave persistida y exige `IDEMPOTENCY_CONFLICT`
ante quote cambiado; con clave nueva exige `PERIOD_ALREADY_INVOICED`. Ambos
rechazos conservan factura, líneas, cargos, outbox y auditoría. No se cambió
la lógica de emisión para hacer pasar el test.
El harness demuestra alta real de tarifa con cobertura, rollback conjunto y
creación/emisión concurrentes en menos de 15 segundos. No demuestra todavía UI
autenticada, rendimiento comercial ni compatibilidad de datos remotos.
El sexto Chromium falló al emitir por esquema local incompleto (`42703`).
No hay recorrido E2E completo ni aplicación remota verificada. No publicar el
servicio nuevo contra un esquema antiguo ni sembrar cobertura para fingir QA.
