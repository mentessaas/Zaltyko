# ADR-0012 — Cierre de acciones Insights sin evidencia al vencer la ventana

- Estado: aceptado para la V1 local
- Fecha: 2026-10-06
- Contexto: el PRD exige resultado medido o `not_measurable` al vencer la
  ventana, y prohíbe atribuir impacto sin evidencia. El actor que inició la
  acción es humano; el worker debe seguir separado y no impersonarlo.

## Decisión

En cada ejecución autenticada del worker se cierra, en lotes, toda acción con
estado `recorded`, outcome `pending` y `evaluation_ends_at <= now()`. Si el flujo
humano no completa primero la acción con evidencia, el worker guarda outcome
`not_measurable`, `after_value = {}` y una nota sin PII. Conserva el actor/fecha
de inicio en la acción, marca el insight `resolved` si sigue `actioned`, emite
auditoría con actor de sistema y publica `insight.action_completed` en el outbox.

El worker bloquea las filas con `FOR UPDATE SKIP LOCKED`; el endpoint manual
bloquea la misma acción con `FOR UPDATE`. Ambas rutas actualizan solo si la
acción sigue `recorded/pending`, de modo que el primer resultado confirmado no
se sobrescribe. Las escrituras de acción, estado, auditoría y outbox son una
transacción.

## Consecuencias y límites

- No se calculan resultados positivos/negativos sin valor posterior observado.
- Outcome manual válido puede ganar la carrera incluso si la ventana ya venció;
  su `after_value` y autoría humana se conservan.
- La retención de insight queda visible como `not_measurable`, útil para
  calibración, no como éxito/fracaso de la recomendación.
- El código se ejecuta cuando el endpoint cron es invocado; no se registra ni
  activa un scheduler. El SLA del PRD sigue sin demostrarse.
