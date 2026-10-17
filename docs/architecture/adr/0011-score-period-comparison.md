# ADR-0011 — Comparabilidad temporal del Health Score

- Estado: aceptado para la V1 local
- Fecha: 2026-10-06
- Contexto: el PRD pide delta contra período anterior comparable. Un score puede
  cambiar de interpretación si se modifica el perfil de objetivos/benchmark; los
  períodos de distinta duración tampoco son comparables sin normalización.

## Decisión

La V1 muestra `score actual - score anterior` solo cuando ambos snapshots tienen
el mismo `benchmarkProfileId`, ambos tienen score numérico y no están en
`insufficient_data`, y sus períodos tienen duración semejante: tolerancia de
hasta tres días para períodos de 28 días o más, y un día para períodos más
cortos.
El candidato es el snapshot previo más reciente dentro de la ventana de 12
snapshots leídos. En cualquier otro caso, `scoreComparison` es null y la UI dice
que no hay período anterior comparable con el mismo perfil.

La delta se expresa en puntos (no porcentaje). Cambiar la versión del perfil
desactiva la comparación automática aunque ambos snapshots sean válidos.

## Consecuencias

- No se atribuye mejora o deterioro cuando cambió la referencia del score.
- Períodos muy distintos, snapshots antiguos fuera de la ventana consultada o
  datos insuficientes no generan delta.
- Año anterior, elección explícita del modo de comparación y un comparador
  estadístico de períodos irregulares quedan fuera de esta V1.
