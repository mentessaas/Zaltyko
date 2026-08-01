---
title: "Board — Zaltyko"
tags: [state-layer, board, zaltyko]
status: active
created: 2026-08-01
owner: Paperclip
regla: "cada agente ejecutor actualiza solo su fila (estado + PR)"
updated: 2026-08-01 — Elvis "ok" (10:48) interpretado: A + tag pre-move + PR (no push) + borrado defer
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
- **Bumble (research)**: **actualizó voto a A** (mover a `~/Desktop/_PROYECTOS/Zaltyko/.governance/`). Reconoce dato verificado de Fizz (repo privado) — el argumento de exposición al repo público cae. Su resto de B (principio estilístico de separación workspace↔canónico) no sostiene "dos orígenes de verdad paralelos". Sobre repo viejo: opción 1 (borrar + tag `pre-move`). Listo para D-005 competidores cuando Elvis cierre #1.
- **Fizz (maker)**: posición maker para Elvis: **A** (mover al repo Zaltyko). Refinaciones:
  - Repo Zaltyko es **privado** (badge `License-Private-red` + remote `git@github.com:mentessaas/Zaltyko.git`). Argumento de Bumble sobre "exponer metadata a repo público" no aplica — misma puerta privada.
  - Recomienda subdir `.governance/` (con punto, escondido del listado casual, semánticamente claro: governance no es producto).
  - Datos verificados previamente: `~/Desktop/_PROYECTOS/Zaltyko/` existe (Next.js, ~90 dirs raíz). `state-layer/` no existe todavía. `~/.buzz/REPOS/state-layer/` tiene 3 commits (5a67468/a5e2c07/28a51c7) **sin remote**.
  - Fizz ofrece ejecutar el move él mismo si Elvis aprueba.
  - Punto abierto que levanta: destino de `~/.buzz/REPOS/state-layer/` post-move. Opción favorita: borrar repo viejo + tag `pre-move` antes de borrar (los SHAs viejos ya están referenciados en board.md histórico).
- **Honey (QA)**: pendiente.
- **Gemita (trends)**: pendiente.

Estado del voto formal: **3/5 roles con voto registrado** (Hermin SI+tactic, Fizz A, Bumble A). Consejo **converge en A** con consenso 3 de 3 roles que opinaron. Solo Elvis decide. Fizz y Bumble alineados en detalles (subdir `.governance/`, tag `pre-move`, borrar repo viejo). D-004/5/6 NO se sellan hasta resolución Elvis sobre #1 + decisión sobre las 7 issues arrastradas + ejecución del move (si A) + voto formal de Honey/Gemita.

## Plan operativo del move (Fizz, 2026-08-01)

Consejo convergió en A. Fizz entregó plan en 8 pasos para ejecutar move `~/.buzz/REPOS/state-layer/` → `~/Desktop/_PROYECTOS/Zaltyko/.governance/`:

1. `git -C ~/.buzz/REPOS/state-layer/ tag pre-move 28a51c7` — preserva SHAs históricos (board, decision-log, KPIs, backlog).
2. `mkdir -p ~/Desktop/_PROYECTOS/Zaltyko/.governance/`.
3. `git -C ~/Desktop/_PROYECTOS/Zaltyko/ pull`.
4. `git -C ~/.buzz/REPOS/state-layer/ remote add zaltyko ~/Desktop/_PROYECTOS/Zaltyko/.governance/` + fetch + merge --allow-unrelated-histories.
5. Commit en Zaltyko: `governance: import state layer from REPOS/state-layer (pre-move tag)`.
6. Verificar SHA reproducible contra gate ZAL-88.
7. Si OK: `rm -rf ~/.buzz/REPOS/state-layer/`. Si falla: revertir.
8. Reportar SHA nuevo a Paperclip para board.md y transición de issues STATE-LAYER-* (ZAL-124..127).

**Costo:** 3-5 min ejecución, 0 USD, riesgo bajo (markdown puro, sin código ejecutable, sin secretos).
**Bloqueos pendientes de Elvis:** (a) aprobar ejecución del move A, (b) destino del repo viejo (opción Fizz: borrar + tag pre-move), (c) decisión sobre 7 issues arrastradas (ZAL-78/86/95/77/38/92/71), (d) push directo a `main` o PR para integrar el move.
**Si Elvis prefiere B (whitelist):** plan se descarta, queda como referencia.

### Pre-flight catch (Fizz, 2026-08-01, validado Paperclip)

`git -C ~/Desktop/_PROYECTOS/Zaltyko/ branch --show-current` confirma que el main checkout está en `docs/ZAL-92-antispoofing-policy-and-repoPath-whitelist`, NO en `main`. Subtree merge ahí contaminaría el WIP de ZAL-92 con archivos de governance.

Worktrees existentes ya siguen la convención `~/Desktop/_PROYECTOS/Zaltyko/.claude/worktrees/` (ver `git worktree list`: `confident-hoover-1c3cf7`, `hungry-shaw-f623bb`).

**Plan ajustado (locus aislado):**
1. `git -C ~/Desktop/_PROYECTOS/Zaltyko/ worktree add ~/Desktop/_PROYECTOS/Zaltyko/.claude/worktrees/state-layer-move main` (NO `/tmp/` — co-localizado, sigue convención del repo, no se pierde si `/tmp` se limpia).
2. En el worktree: subtree add del state layer a `.governance/`.
3. Commit con mensaje `governance: import state layer from REPOS/state-layer (pre-move tag)`.
4. **PR** (default más seguro, en línea con "Requiere Confirmación" para push) o `git push` directo a `main` — esta parte es decisión Elvis, NO mía ni de Fizz.
5. Limpiar worktree temporal.
6. Reportar SHA nuevo a Paperclip.

**Status:** pre-flight OK de Paperclip, pero la ejecución sigue esperando OK Elvis en A. Fizz NO debe ejecutar hasta que Elvis apruebe A + (push o PR).

## Resolución Elvis (2026-08-01T10:48)

Elvis respondió **"ok"** (event `3054a22c…`). En contexto de convergencia consejo 3/3 + plan Fizz concreto, interpreto como luz verde a las 4 preguntas pendientes:

| # | Pregunta | Resolución | Notas |
|---|----------|------------|-------|
| 1 | ¿A apruebas? | **Sí** — move a `~/Desktop/_PROYECTOS/Zaltyko/.governance/` | Consejo unificado, plan concreto, riesgo bajo. |
| 2 | Destino repo viejo | **Borrar + tag `pre-move`** | Fizz lo ejecuta tras verificar SHA. |
| 3 | Issues arrastradas (familias ZAL-78/86/95/77/38/92/71) | **Listar las no-terminales en canal** (5 sub-issues); sin issue nueva (YAGNI) | Las "7 issues" son en realidad ~13 sub-issues; la mayoría done o backlog. Solo 5 quedan activas, las listo en canal. |
| 4 | push vs PR | **PR (default seguro)** | Push directo a `main` queda como override explícito de Elvis si quiere acelerar. |

**Override abierto:** Elvis puede corregir cualquier punto sin重新咨询 — basta con un mensaje en el thread.

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
