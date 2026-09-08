---
status: active
owner: producto/tech
last_reviewed: 2026-08-10
source:
  - ../../00-Inicio/Guia de trabajo para agentes.md
  - ../../../AGENTS.md
---
# ZAL-296 — formato del log de failover en dry-run

Este documento fija la forma estable del evento estructurado que emite
`server/src/services/execution/router.ts`. Sirve para inspeccionar el dry-run
durante la semana de observación sin cambiar el adaptador que ejecuta al agente.

## Activación y semántica

- `PAPERCLIP_FAILOVER_DRY_RUN` ausente o con valor `true`: el router solo
  registra la alternativa elegible y devuelve el adaptador primario.
- `PAPERCLIP_FAILOVER_DRY_RUN=false`: el router puede devolver la alternativa
  elegible; esta promoción queda reservada a una decisión explícita del board.
- El router no muta el estado del breaker. El caller le entrega un snapshot.
- Todos los eventos de este documento usan `event: "provider_failover"`.

## Evento de decisión (`logger.info`)

Se emite cuando el primario no está disponible y existe una alternativa
declarada, conocida y disponible:

```json
{
  "event": "provider_failover",
  "phase": "dry_run",
  "ts": "2026-08-10T03:00:00.000Z",
  "agentId": "<agent-id>",
  "companyId": "<company-id>",
  "agentName": "<display-name-or-null>",
  "primary": "claude_local",
  "chosen": "codex_local",
  "candidateMaxAttempts": 1,
  "dryRun": true
}
```

`phase` es `dry_run` mientras el flag está activo y `live` cuando el flag es
`false`. `chosen` es la alternativa que se habría usado (o que se usa en
live). En dry-run, el resultado de la función conserva `primary` como `type`.

Cuando el primario no está disponible y no queda ninguna alternativa viable,
se emite el mismo evento con `chosen: null` y
`reason: "no_alternative_declared_or_available"`. En ese caso la función
devuelve `type: null`.

## Evento de descarte (`logger.warn`)

Cada alternativa declarada que no puede evaluarse o usarse emite un warn con
esta base:

```json
{
  "event": "provider_failover",
  "phase": "skip",
  "reason": "<reason>",
  "agentId": "<agent-id>",
  "companyId": "<company-id>",
  "primary": "claude_local",
  "candidate": "codex_local"
}
```

Los valores de `reason` y campos adicionales son:

| reason | Cuándo | Campos adicionales |
| --- | --- | --- |
| `unknown_adapter` | El tipo no pertenece a built-ins ni al registro de plugins | ninguno |
| `self_reference` | La alternativa apunta al mismo tipo que el primario | ninguno |
| `max_attempts_zero` | La declaración opta por no intentar esa alternativa | `candidateMaxAttempts: 0` |
| `breaker_open` | El snapshot marca la alternativa no disponible | `breakerState` |

Los warns no incluyen contenido del prompt, tokens, secretos ni datos de
usuario. Son adecuados para agregación por `agentId`, `primary`, `candidate` y
`reason`.

## Agregación de la matriz de observación

Si cada línea del archivo contiene un objeto JSON, la matriz de alternativas
elegibles se puede resumir con:

```sh
jq -s '
  map(select(.event == "provider_failover" and .chosen != null))
  | group_by({agentId, primary, chosen})
  | map({agentId: .[0].agentId, primary: .[0].primary,
         chosen: .[0].chosen, frequency: length})
' provider-failover.log
```

Este resumen es evidencia de sandbox/dry-run. No autoriza por sí mismo a
activar `PAPERCLIP_FAILOVER_DRY_RUN=false`, asignar cupos de proveedor ni
cambiar declaraciones por agente.
