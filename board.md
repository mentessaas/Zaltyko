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
| ZAL-128 | SL-7 Roadmap Q3-Q4 Zaltyko Web | backlog | D-004 (voto consejo + KPI concreto). Position paper Hermin: SI condicionado a D-005 cerrado; KPI propuesto = roadmap con 3 métricas (adquisición, conversión, retención) + baseline medible al cierre de Q3. |
| ZAL-129 | SL-8 Investigación competidores (Bumble) | backlog | D-005 (voto consejo + KPI research). Position paper Hermin: SI; KPI propuesto = informe con ≥5 competidores, positioning y pricing. |
| ZAL-130 | SL-9 Spec onboarding Zaltyko Web (Fizz) | backlog | D-006 (voto consejo + KPI onboarding). Position paper Hermin: SI, bloqueado detrás de D-004; KPI propuesto = spec con flujo definido + métrica de activación (% completan paso 1) + criterio de aceptación. |
| ZAL-124..127 | SL-1..4 state layer (v0) | in_review | gate anti-spoofing ZAL-88: repo `~/.buzz/REPOS/state-layer/` no está en whitelist `repoPath`. Bloqueo pendiente decisión Elvis. |

## Position papers recibidos (log de movimientos, no decisiones selladas)

- **Hermin (product/ops)**: SI a los 3 con **secuencia obligatoria 5 → 4 → 6**. Sin disidencia fuerte. Sobre #1: táctico, fuera del consejo.
- **Bumble (research)**: no vota formal hasta #1 resuelto. Lectura para Elvis: recomienda **B** (whitelist) por separación workspace↔canónico.
- **Fizz (maker)**: posición maker para Elvis: **A** (mover al repo Zaltyko) con subdir `docs/state-layer/` o `.governance/`. Datos verificados:
  - `~/Desktop/_PROYECTOS/Zaltyko/` existe (Next.js, ~90 dirs raíz). `state-layer/` no existe todavía.
  - `~/.buzz/REPOS/state-layer/` tiene 3 commits (5a67468/a5e2c07/28a51c7) **sin remote**.
  - Fizz ofrece ejecutar el move él mismo si Elvis aprueba.
- **Honey (QA)**: pendiente.
- **Gemita (trends)**: pendiente.

Estado del voto formal: **1/4 roles con voto registrado** (Hermin). Consejo dividido en #1 (Hermin tactic, Fizz A, Bumble B) — Elvis decide. D-004/5/6 NO se sellan hasta tener ≥2 votos restantes + resolución Elvis sobre #1 + decisión sobre las 7 issues arrastradas.

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
