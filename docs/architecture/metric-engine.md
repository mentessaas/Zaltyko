# Motor de métricas versionado

- Estado: implementado y verificado localmente
- Fecha: 2026-10-06
- Alcance: PR-05 del plan Owner Dashboard / Academy Health Score

## Arquitectura

El motor es una dependencia unidireccional de operaciones y ledger:

```text
outbox -> consumo idempotente -> invalidación 90 días -> metric run
       -> evidencia inmutable por run -> valor materializado actual
```

Un fallo analítico se registra en `metric_runs.status = failed` y no participa
en las transacciones de enrollment, asistencia o cobros. La recomputación exige
rol `owner` o `admin`, resuelto en base de datos, y se serializa por tenant,
scope, período y versión de fórmulas.

## Evidencia y lectura

- `metric_definitions`: contrato de 12 métricas y versión de fórmula.
- `metric_runs`: parámetros, watermark, versión del conjunto y resultado.
- `metric_run_values`: evidencia inmutable de cada ejecución.
- `metric_values`: read model actual, actualizado por clave natural versionada.
- `metric_event_consumptions`: deduplicación por evento/handler/versión.
- `metric_invalidations`: ventana conservadora de 90 días para reconciliación.
- `data_quality_issues`: defectos parciales o inválidos sin PII.

La misma entrada, watermark y versión produce los mismos valores. Una nueva
ejecución conserva la anterior y solo sustituye el read model actual.

## Fórmulas v1

| Métrica                     | Fórmula / política                                                        |
| --------------------------- | ------------------------------------------------------------------------- |
| Atletas al cierre           | atletas distintos con enrollment activo en `period_end`                   |
| Atletas activos medios      | promedio de snapshots diarios                                             |
| Ocupación                   | suma ocupados / suma capacidad efectiva; nunca media simple de porcentajes |
| Asistencia                  | `present + late` / registros                                               |
| Cobertura de asistencia     | registros / plazas esperadas en sesiones completadas                      |
| Retención / churn           | cohorte activa inicial que continúa/no continúa en la organización         |
| Ingreso devengado           | cargos del período no anulados                                             |
| Cobrado neto                | asignaciones menos refunds                                                 |
| Pendiente                   | cargos menos asignaciones brutas                                           |
| Collection rate             | cobrado neto atribuible / cargos vencidos al watermark                     |
| Demanda waitlist            | entradas `waiting`, contactables y con consentimiento                      |

Una transferencia interna conserva al atleta en la cohorte organizacional. La
capacidad efectiva es el mínimo válido entre plantilla, override de sesión y
sala. Las sesiones canceladas se excluyen.

## Calidad y frescura

Cada valor incluye numerador, denominador, cobertura, `computed_at` y
`source_watermark`. Denominador ausente produce `insufficient` con valor nulo,
nunca cero. Capacidad parcialmente válida produce `partial`; una inconsistencia
matemática produce `invalid`. Para períodos actuales, watermark con más de 15
minutos pasa a `stale` y conserva en diagnostics la calidad anterior y el lag.

## Golden fixture

`zaltyko_metrics_golden.sql` contiene 85 atletas sintéticos, dos clases 5/10 y
80/100, una transferencia interna, una baja real, asistencia 74/85, tres
entradas contactables y el ledger 100 €/60 €/10 €.

Evidencia local:

- ocupación `85/110 = 77,272727%`;
- retención `84/85` y churn `1/85`;
- transferencia interna no contada como churn;
- devengado 100 €, cobrado neto 50 €, pendiente 40 €, collection rate 50%;
- tres consumos concurrentes de evento crean una invalidación;
- dos recomputaciones dejan 12 valores actuales y 24 evidencias inmutables;
- property tests verifican ponderación, conmutatividad, complementariedad de
  cohorte e identidades financieras.

## Límites

No existe todavía scheduler desplegado, API, cache distribuida, score,
dashboard ni E2E autenticado. No se validó rendimiento al volumen objetivo ni
runtime remoto. Programa/grupo y reconocimiento fiscal/prorrateado requieren
nuevas versiones de fórmula; no se añadirán retroactivamente a v1.
