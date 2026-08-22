---
title: "KPIs — Zaltyko (Q3 2026)"
tags: [state-layer, kpis, zaltyko]
status: active
created: 2026-08-01
regla: "una decisión del log referencia un KPI de esta tabla; sin KPI, no se aprueba"
---

# KPIs — Q3 2026

Trimestre: 2026-07-01 → 2026-09-30.
Owner de la tabla: Zaltyko Paperclip.
Regla: una decisión del decision-log referencia un KPI de esta tabla; si el KPI no existe, no se aprueba el item.

| KPI | Base | Target | Due | Owner | Fuente |
|-----|------|--------|-----|-------|--------|
| Decisiones reales del consejo con KPI asociado | 0/semana | ≥1/semana | 2026-09-01 | Paperclip | `decision-log.md` |
| Formato estable de los 4 artefactos del state layer | n/a | 4/4 archivos en formato final | 2026-08-31 | Paperclip | `REPOS/state-layer/` |
| Caducidad respetada (sin decisiones zombi) | n/a | 0 decisiones expiradas sin revisión | continuo | Paperclip | `decision-log.md` (campo Fecha_revisión) |
| Latencia del consejo (async) | n/a | posición paper ≤24h tras convocatoria | continuo | consejo | Buzz channel Zaltyko |

## KPI del propio state layer (Fizz, 2026-08-01)
Métrica simple: ≥1 decisión real del consejo/semana durante el primer mes, con KPI asociado. Si no se llega, el log es decorativo y se revisa en D-revisión.

## Pendientes para próximos trimestres
- KPIs de producto Zaltyko Web (onboarding, retención, MRR).
- KPIs de GTM (CAC, LTV, pipeline).
- KPIs de operaciones (uptime, costo por agente, resolución de issues).
