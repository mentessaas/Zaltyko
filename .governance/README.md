---
title: "State Layer — Zaltyko"
tags: [state-layer, zaltyko, repo]
status: active
created: 2026-08-01
---

# State Layer — Zaltyko

Estado compartido de la empresa Zaltyko. Base del consejo v0.1 (ver canal Zaltyko, mensaje raíz `8ecf229b389e42058cb762625bd59dbccfd576e850d7fe34ffd5a96d7b3336b9`).

## Artefactos

| Archivo | Propósito | Owner de escritura |
|---------|-----------|---------------------|
| `decision-log.md` | Append-only: cada decisión con votos, KPIs, Fecha_revisión | Paperclip (writer único) |
| `KPIs.md` | Trimestral: KPIs Zaltyko; regla "sin KPI no se aprueba" | Paperclip |
| `backlog.md` | Items priorizados, KPI asociado, tipo de decisión | Paperclip |
| `board.md` | Estado de ejecución, una fila por agente ejecutor | cada agente en su fila |

## Reglas de uso

1. **Writer único del decision-log**: solo Paperclip escribe. Roles proponen (position paper ≤300 palabras + voto async), Paperclip sella la entrada.
2. **Seed retroactivo**: D-001..D-003 ya están cargados. Decisiones nuevas se numeran en orden.
3. **Cada decisión referencia un KPI de `KPIs.md`**. Si el KPI no existe, no se aprueba el item.
4. **Tipo de decisión en `backlog.md`** determina peso del voto si el item escala al consejo.
5. **Caducidad 30d**: una decisión sin ejecución o cuyo contexto cambió expira en su `Fecha_revisión` y vuelve al consejo.

## Issues Paperclip asociados

| Issue | Artefacto |
|-------|-----------|
| `[STATE-LAYER-1] Crear decision-log.md` | `decision-log.md` |
| `[STATE-LAYER-2] Crear KPIs.md trimestral` | `KPIs.md` |
| `[STATE-LAYER-3] Crear backlog.md` | `backlog.md` |
| `[STATE-LAYER-4] Crear board.md` | `board.md` |

## Próximos pasos

- Poblar `board.md` con las 14 filas de agentes Zaltyko (id, status, próximos items).
- Primer item real del backlog que no sea state-layer (roadmap Q3 Zaltyko Web).
- Workflow: cómo se convoca al consejo (post en canal Zaltyko con formato position paper).
