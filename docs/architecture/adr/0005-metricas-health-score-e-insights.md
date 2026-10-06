# ADR-0005 — Métricas, Health Score e Insights

- Estado: aceptada; implementación pendiente de capa operativa
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

## Evidencia

- PRD, secciones 8–14, 20.3, 21 y AC-01/AC-02/AC-10/AC-13.
