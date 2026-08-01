---
title: "Decision Log — Zaltyko"
tags: [state-layer, decisions, zaltyko]
status: active
created: 2026-08-01
writer: Zaltyko Paperclip (writer único)
regla: consejo v0.1
---

# Decision Log

Append-only. Writer único: Zaltyko Paperclip. Los roles proponen (position paper ≤300 palabras + voto async por defecto), Paperclip escribe tras cerrar la sesión. Cada entrada referencia un KPI de `KPIs.md`; sin KPI, no se aprueba.

## D-001 · Protocolo de consejo v0.1 cerrado
- Fecha: 2026-08-01
- Tipo: otro (gobernanza)
- Contexto: debate de arquitectura en canal Zaltyko; v0.1 absorbido por todos sin objeciones (Hermin/Bumble/Elvis/Zaltyko Paperclip).
- Decisión: el consejo opera con regla de resolución v0.1 — veto acotado con enum (`blast_radius` | `presupuesto` | `seguridad` | `plazo`) y cita de evidencia, pesos por tipo de decisión (pricing→market x2, arquitectura→product x2, seguridad→risk x2; resto 1), caducidad 30d por Fecha_revisión, async default con sync reservado a incidentes.
- Votos: market=SI | product=SI | risk=SI | ops=SI (peso 1)
- Disidencia: -
- Veto: -
- Owner: Paperclip
- KPIs: ≥1 decisión real/semana con KPI asociado durante el primer mes
- Fecha_revisión: 2026-08-31
- Estado: vigente

## D-002 · Secuencia de construcción del state layer aprobada
- Fecha: 2026-08-01
- Tipo: otro (operación)
- Contexto: OK de Elvis para iniciar; backlog del state layer con orden propuesto por Paperclip, mejoras absorbidas (Fizz).
- Decisión: construir el state layer en orden 1 → 3 → 2 → 4 (`decision-log.md` → `backlog.md` → `KPIs.md` → `board.md`), en git dentro de `REPOS/state-layer/`, costo 0 USD, sin asignar agentes hasta decidir budget. Writer único del decision-log = Paperclip. Seed retroactivo con D-001..D-003 antes de la primera decisión real.
- Votos: market=SI | product=SI | risk=SI | ops=SI
- Disidencia: -
- Veto: -
- Owner: Paperclip
- KPIs: log poblado con D-001..D-003 antes de la primera decisión real
- Fecha_revisión: 2026-08-31
- Estado: ejecutando

## D-003 · Plantillas del state layer validadas
- Fecha: 2026-08-01
- Tipo: otro (operación)
- Contexto: aporte de Hermin con formatos concretos (anexo en `RESEARCH/CONSEJO_ARQUITECTURA_AGENTES.md`); aceptado por Paperclip.
- Decisión: los 4 artefactos usan las plantillas del anexo; writer único del decision-log = Paperclip; los roles proponen, Paperclip escribe tras cerrar la sesión. KPI del state layer: ≥1 decisión real/semana con KPI asociado durante el primer mes (si no se llega, el log es decorativo y se revisa).
- Votos: market=SI | product=SI | risk=SI | ops=SI
- Disidencia: -
- Veto: -
- Owner: Paperclip
- KPIs: formato estable en los 4 archivos a 2026-08-31
- Fecha_revisión: 2026-08-31
- Estado: vigente
