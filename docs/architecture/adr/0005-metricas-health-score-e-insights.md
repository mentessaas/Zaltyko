# ADR-0005 — Métricas, Health Score e Insights

- Estado: aceptada; motor de métricas v1 cerrado localmente, score e insights pendientes
- Fecha: 2026-10-06
- Alcance: analytics, scoring, dashboard e insights

## Decisión

La dirección de dependencias es obligatoria:

```text
operaciones -> outbox -> métricas -> snapshots de score -> insights
                                      |
                                      +-> query model del dashboard
```

- Las métricas se versionan por definición, fórmula y período.
- Cada ejecución guarda watermark, versión del código, parámetros, cobertura,
  calidad y resultado. Recalcular no sobrescribe evidencia histórica.
- El Academy Health Score consume únicamente métricas materializadas y un
  perfil benchmark versionado.
- Una dimensión sin cobertura suficiente se marca `insufficient_data`; nunca
  se convierte implícitamente en cero.
- Cada score conserva contribuciones por métrica para explicar valor, peso,
  benchmark, cobertura y frescura.
- Insights consume métricas y snapshots, se deduplica por regla/entidad/ventana
  y registra acción, resolución y outcome.
- El Owner Dashboard es una capa de lectura. No contiene fórmulas de negocio ni
  consulta historiales de eventos completos por request.

## Gates de entrada

No se implementará el score hasta que el fixture sintético produzca de forma
reconstruible: atletas activos, fill rate, asistencia, retención/churn y un
ledger mínimo reconciliable.

El gate de entrada quedó aprobado en PR-05 con el fixture sintético congelado.
La evidencia, fórmulas y límites están en
`docs/architecture/metric-engine.md`. PR-06 puede consumir exclusivamente
`metric_values`/`metric_run_values`; no puede consultar operaciones para
reformular métricas dentro del score.

## Evidencia

- PRD, secciones 8–14, 20.3, 21 y AC-01/AC-02/AC-10/AC-13.
