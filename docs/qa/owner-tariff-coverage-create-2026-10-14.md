# Alta de tarifas con cobertura explícita — QA local

**Fecha:** 2026-10-14

**Rama:** `codex/owner-tariff-coverage-create-20261014`

**Base:** `e2345ea5`

## Alcance

El formulario de alta de tarifa mensual permite elegir expresamente las plantillas de clase que cubre. Las opciones se cargan desde `GET /api/v1/owner/price-plans/options`; la interfaz valida el ámbito de organización y sede, no selecciona clases por defecto y avisa cuando el catálogo recibido está truncado. La creación incluye `coverage` en el mismo POST que la tarifa:

```json
{
  "coverage": {
    "classTemplateIds": ["<UUID>"],
    "startsOn": "YYYY-MM-DD",
    "endsOn": null
  }
}
```

La selección debe contener entre 1 y 100 IDs únicos de las opciones válidas disponibles. `startsOn` es obligatorio; `endsOn` puede ser `null` para una cobertura sin fecha final o una fecha igual o posterior al inicio. Los reintentos conservan cuerpo y clave de idempotencia mientras no cambie la selección o el periodo.

## Comprobaciones locales

- `pnpm exec vitest run tests/owner-monthly-invoice-workspace.test.tsx tests/owner-monthly-invoices-manager.test.tsx tests/owner-tariff-coverage-create.test.tsx --reporter=dot`: **3 archivos, 32 tests aprobados**.
- `pnpm exec eslint` sobre el componente y los dos tests modificados: **PASS**.
- `pnpm exec prettier --check` sobre los mismos archivos: **PASS**.
- `git diff --check`: **PASS**.
- `pnpm typecheck`: **PASS** (`tsc --noEmit`).

## Límites de verificación

Los tests de UI usan mocks y fixtures sintéticas. No se ejecutó E2E autenticado ni se verificó la integración desplegada con el endpoint backend. Este cambio no modifica API, servicio, esquema, migraciones, harness E2E ni ADR compartidos; queda pendiente la integración coordinada con los cambios backend/Main.
