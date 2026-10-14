# Proyecciones de retención: evidencia local y gate runtime

**Estado: NO-GO.** Las fases 1 y 2 están integradas en el Main indicado, pero no hay evidencia de ejecución PostgreSQL ni E2E autenticado para este flujo. La documentación de esta rama no vuelve a ejecutar validaciones.

## Procedencia

| Hito | SHA | Evidencia |
| --- | --- | --- |
| Fase 1: snapshot de sedes activas | `8a67e8dc94918f944230adffb0f57d15ffaecb15` | Lector keyset org-scoped `READ ONLY REPEATABLE READ`; worklist opaco congelado; proceso y builder comparten snapshot; builder standalone conserva lectura propia. |
| Integración fase 1 | `f33bd512055ff5a45921b4c79c5b5cb8cd2a054d` | Merge reportado de snapshot consistente en analytics. |
| Fase 2: batches y transporte de IDs | `34e0afdb3bf8f7614fc818a62340737a7fd4bd09` | Inserts de 500 scopes, discovery tenant-scoped con límite por bloque, locks globales ascendentes, `completedRuns` tenant-scoped y `uuid[]` con un parámetro para `ANY`. |
| Main integrado | `820eedb06ce627c49322054ff5ad347faffb9aed` | Merge de batches tenant-scoped, con health-history integrado; QA38 sin bloqueantes según reporte del responsable. |

La transacción de escritura, el timeout `120s` y las agregaciones del CTE se conservan. El cambio `IN (lista expandida)` a `= ANY($n::uuid[])` cambia el transporte de IDs; no modifica filtros de cohorts ni agregados.

## Checks focales reportados en las ramas de fase

Estos resultados vienen de las ramas locales indicadas, **no de una corrida sobre el Main integrado**.

### Fase 1

```text
node_modules/.bin/vitest run tests/active-location-snapshot.test.ts tests/build-retention-cohort-projections-snapshot.test.ts tests/process-metric-invalidation.test.ts
11/11 tests PASS
pnpm typecheck
PASS
node_modules/.bin/eslint src/modules/analytics/application/active-location-snapshot.ts src/modules/analytics/application/build-retention-cohort-projections.ts src/modules/analytics/application/process-metric-invalidation.ts tests/active-location-snapshot.test.ts tests/build-retention-cohort-projections-snapshot.test.ts tests/process-metric-invalidation.test.ts
PASS
git diff --check
PASS
```

### Fase 2

```text
node_modules/.bin/vitest run tests/active-location-snapshot.test.ts tests/build-retention-cohort-projections-snapshot.test.ts tests/process-metric-invalidation.test.ts
12/12 tests PASS
pnpm typecheck
PASS
node_modules/.bin/eslint src/modules/analytics/application/build-retention-cohort-projections.ts tests/build-retention-cohort-projections-snapshot.test.ts
PASS
git diff --check
PASS
```

Los tests también compilan SQL con `PgDialect.sqlToQuery` y comprueban la lista de parámetros; `pg/lib/utils.prepareValue` comprueba la serialización local del array. Los tests simulan el contrato de consulta y **no ejecutan PostgreSQL**. La compilación SQL y la utilidad `prepareValue` tampoco demuestran el comportamiento del servidor dentro de una transacción real.

## Evidencia runtime pendiente

- Confirmar en PostgreSQL local sintético que `SET TRANSACTION ... READ ONLY` se aplica antes de la primera lectura y que una activación/desactivación concurrente entre páginas no cambia el snapshot observado.
- Confirmar con dos workers el orden efectivo de locks, el bloqueo/replay concurrente y la ausencia de omisiones o deadlocks en `retention_cohort_projection_runs`.
- Comparar agregados completos y rollback transaccional con fixtures sintéticos, conservando el CTE existente.
- Completar el E2E autenticado acordado después de la validación local.

Hasta completar esas evidencias, los tests unitarios, los locks SQL declarados y el merge en Main no cierran el gate: **NO-GO**. Esta nota no afirma readiness, deployment ni corrección runtime.
