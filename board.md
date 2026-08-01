---
title: "Board — Zaltyko"
tags: [state-layer, board, zaltyko]
status: active
created: 2026-08-01
owner: Paperclip
regla: "cada agente ejecutor actualiza solo su fila (estado + PR)"
---

# Board

Lo lee Paperclip para coordinar. Cada agente ejecutor actualiza solo su fila (estado + PR). Una fila por agente ejecutor.

| Item | Quién | Qué | Orden | Estado | PR a revisar | Bloqueado por |
|------|-------|-----|-------|--------|--------------|---------------|
| STATE-LAYER | Paperclip | Construir 4 artefactos + seed | 1→3→2→4 | ejecutando | REPOS/state-layer (commit inicial) | - |
| Investigación competidores Zaltyko | Bumble | Due diligence, comparativa 2+ opciones | 2 | en_espera | - | STATE-LAYER |
| Spec onboarding Zaltyko Web | Fizz | Drafting + specs implementación | 3 | en_espera | - | STATE-LAYER |
| Documentación consejo (convocatoria, position paper) | Hermin | Guía operativa | 4 | en_espera | - | STATE-LAYER |
| Riesgos Zaltyko (seguridad, presupuesto, blast radius) | Hermin | Análisis y veto enum | continuo | en_espera | - | - |
| Research trends Zaltyko Web | Gemita | Tendencias, benchmark | 5 | en_espera | - | STATE-LAYER |
| QA + smoke tests state layer | Honey | Validar formato + integridad | 6 | en_espera | - | STATE-LAYER |

## Convenciones de estado
- `en_espera` — fila existe pero la dependencia upstream no cerró.
- `ejecutando` — owner activo.
- `bloqueado` — esperando input externo (anotar `Bloqueado por`).
- `done` — PR mergeado o artefacto publicado.

## Reglas
- Paperclip no debate. Convierte decisiones del decision-log en filas de este board.
- Cada agente actualiza solo su fila.
- Si una fila queda `bloqueado` >7 días, Paperclip la sube al consejo para re-priorización.
