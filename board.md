---
title: "Board — Zaltyko"
tags: [state-layer, board, zaltyko]
status: active
created: 2026-08-01
owner: Paperclip
regla: "cada agente ejecutor actualiza solo su fila (estado + PR)"
updated: 2026-08-01 — poblado con 14 agentes Zaltyko + consejo
---

# Board

Lo lee Paperclip para coordinar. Cada agente actualiza solo su fila (estado + PR). Una fila por agente ejecutor (Zaltyko) y por rol del consejo (Buzz).

## Ejecutores Zaltyko (14 agentes Paperclip)

| Agent | Quién | Qué | Estado inicial | PR | Bloqueado por |
|-------|-------|-----|----------------|----|----------------|
| `65d16bd7-...` | Product Lead | Roadmap Zaltyko Web, priorización de features, specs | en_espera | - | primer item real del backlog |
| `175643b5-...` | Product Designer / UX Researcher | UX flows, research, wireframes | en_espera | - | - |
| `5d63f5f6-...` | Content | Copy, blog posts, communications | en_espera | - | - |
| `3e2e66b2-...` | Customer Support | User feedback, tickets | en_espera | - | - |
| `41412a19-...` | Summarizer (paused) | Status summaries, recap | pausado | - | - |
| `acade097-...` | Developer | General engineering | en_espera | - | - |
| `2e390dcf-...` | Reflection Coach (paused) | Process improvement, retrospectives | pausado | - | - |
| `96d648c9-...` | Data & Analytics | Métricas, dashboards | en_espera | - | - |
| `7af0b3b8-...` | CEO (codex_local) | Decisiones estratégicas, escalación | en_espera | - | - |
| `6909a098-...` | Platform & Security | Auth, RLS, infra, riesgos | en_espera | - | - |
| `5bcea506-...` | Web Developer | Frontend Zaltyko Web | en_espera | - | - |
| `04643dd6-...` | Marketing | GTM, posicionamiento, campañas | en_espera | - | - |
| `c07d53ca-...` | QA | Tests, smoke, validación | en_espera | - | - |
| `87261eba-...` | Mobile Developer | Mobile apps Zaltyko | en_espera | - | - |

## Backlog en posición de partida (Paperclip, costo 0 USD)

| Issue Paperclip | Backlog | Estado | Bloqueado por |
|-----------------|---------|--------|----------------|
| ZAL-128 | SL-7 Roadmap Q3-Q4 Zaltyko Web | backlog | D-004 (voto consejo + KPI concreto) |
| ZAL-129 | SL-8 Investigación competidores (Bumble) | backlog | D-005 (voto consejo + KPI research) |
| ZAL-130 | SL-9 Spec onboarding Zaltyko Web (Fizz) | backlog | D-006 (voto consejo + KPI onboarding) |
| ZAL-124..127 | SL-1..4 state layer (v0) | in_review | gate anti-spoofing ZAL-88: repo `~/.buzz/REPOS/state-layer/` no está en whitelist `repoPath`. Bloqueo pendiente decisión Elvis. |

## Consejo (5 roles Buzz AI)

| Rol | Quién (handle) | Disparador | Estado |
|-----|----------------|------------|--------|
| market / GTM | @Bumble | Decisión con 2+ opciones o data previa faltante | en_espera |
| product / maker | @Fizz | Implementación práctica, drafting, PRs | en_espera |
| research / trends | @Gemita | Investigación, benchmark, tendencias | en_espera |
| QA / validación | @Honey | Smoke tests, validación de artefactos | en_espera |
| risk / gobernanza | @Hermin | Riesgos, vetos enum, documentación proceso | en_espera |

Writer único del decision-log = @Zaltyko Paperclip. Los roles proponen, Paperclip sella.

## Convenciones de estado
- `en_espera` — fila existe pero la dependencia upstream no cerró.
- `ejecutando` — owner activo.
- `bloqueado` — esperando input externo (anotar `Bloqueado por`).
- `pausado` — agente pausado administrativamente (no asignar trabajo nuevo).
- `done` — PR mergeado o artefacto publicado.

## Reglas
- Paperclip no debate. Convierte decisiones del decision-log en filas de este board.
- Cada agente actualiza solo su fila.
- Si una fila queda `bloqueado` >7 días, Paperclip la sube al consejo para re-priorización.
- Filas `pausado` no reciben trabajo nuevo sin despausar el agente.
