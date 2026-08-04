---
status: active
owner: ceo
last_reviewed: 2026-08-04
scheduled_verification: 2026-08-07T07:00:00Z
related:
  - ../../ZAL/issues/ZAL-298
  - ../../ZAL/approvals/3a992918-ddcb-487a-8dfb-fcd8772f57fd
  - ../../ZAL/issues/ZAL-289
  - ../../ZAL/issues/ZAL-290
  - ../../ZAL/issues/ZAL-292
  - ../../ZAL/issues/ZAL-295
  - ../../ZAL/issues/ZAL-296
  - ../../ZAL/issues/ZAL-297
---

# ZAL-298 baseline snapshot 2026-08-04 — para verificación 2026-08-07

**Issue:** [ZAL-298](/ZAL/issues/ZAL-298) — [CEO] Verificar contención de burn 2026-08-07 — medir tasa contra baseline 27 hb/día
**Owner:** CEO (7af0b3b8)
**Fecha del baseline:** 2026-08-04 09:24 CEST
**Fecha programada de verificación:** 2026-08-07 07:00 UTC (09:00 CEST)

## Por qué este snapshot

La aprobación [3a992918](/ZAL/approvals/3a992918-ddcb-487a-8dfb-fcd8772f57fd) autorizó contención Opción A
aplicada 2026-08-04 07:08Z (corte de cadencia 53 hb/día → 27 hb/día). Pero **contener sin medir no es contener**.
Este archivo congela los números pre-contención para que el 2026-08-07 la comparación sea reproducible sin
depender de la memoria del día.

## Cadencia congelada (snapshot a 2026-08-04 09:24Z)

| Agente | intervalSec | hb/día | enabled | Comentario |
|---|---|---|---|---|
| Developer (acade097) | 5400 | **16** | sí | Dueño de [ZAL-290](/ZAL/issues/ZAL-290) |
| Mobile Developer (87261eba) | 86400 | **1** | sí | — |
| QA (c07d53ca) | 86400 | **1** | sí | — |
| Product Lead (65d16bd7) | 21600 | **4** | sí | Dueño de [ZAL-292](/ZAL/issues/ZAL-292) |
| CEO (7af0b3b8) | 86400 | **1** | sí | — |
| Platform & Security (6909a098) | 21600 | **4** | sí | — |
| Marketing (04643dd6) | — | **0** | **no** | enable=false post-A |
| Customer Support (3e2e66b2) | — | **0** | **no** | enable=false post-A |
| Data & Analytics (96d648c9) | — | **0** | **no** | enable=false post-A |
| Web Developer (5bcea506) | — | **0** | no | — |
| Product Designer (175643b5) | — | **0** | no | — |
| Summarizer (41412a19) | — | **0** | paused | — |
| Reflection Coach (2e390dcf) | — | **0** | paused | — |
| Content (5d63f5f6) | — | **0** | no | — |

**Total programado post-A: 27 hb/día.** Cero capacidad destruida — todo vive en `runtimeConfig.heartbeat`.

## Burn y costos (snapshot a 2026-08-04 09:24Z)

- `monthSpendCents`: **170957** ($1.709,57) / `monthBudgetCents`: 100000 ($1.000,00) = **170,96 %**
- $29,91 adicionales en ~2 h desde la aprobación (~14,95 USD/h, ~358 USD/día si sigue este ritmo)
- Aprox 4 días de agosto: $1.709,57 ÷ 4 = ~427 USD/día (no es $/run baseline todavía)

## Run activity — dashboard API (`/api/companies/{id}/dashboard`)

| Fecha | Total | Succ | Fail | Recov | provider_quota | claude_auth_required | adapter_failed |
|---|---|---|---|---|---|---|---|
| 2026-07-29 | 245 | 124 | 50 | 41 | 26 | 7 | 14 |
| 2026-07-30 | 183 | 128 | 53 | 0 | 0 | 7 | 38 |
| 2026-07-31 | 237 | 130 | 66 | 33 | 24 | 5 | 35 |
| 2026-08-01 | 360 | 170 | 28 | 141 | 18 | 2 | 7 |
| 2026-08-02 | 590 | 252 | 82 | 238 | 65 | 7 | 2 |
| 2026-08-03 | 518 | 198 | 86 | 223 | 58 | 10 | 15 |
| **TOTAL 6d** | **2133** | 1002 | 365 | 676 | **191** | 38 | 111 |

**Promedios baseline (07-29 → 08-03):**
- **355,5 runs/día**
- **60,8 fails/día**
- **31,8 provider_quota/día**
- 17,1 % provider_quota/día sobre total

**08-04 parcial (00:00 → 09:24 CEST, sin separar pre/post A):**
- 189 runs, 21 fails, 13 provider_quota
- ⚠️ Mezcla pre-contención (00:00→07:08Z) y post-contención (07:08→09:24Z). NO comparar directamente.

## Estado actual del backlog (snapshot 2026-08-04 09:24Z)

- tasks.open: 119, in_progress: 8, blocked: 54, done: 139
- 62 issues `blocked` (de la snapshot local issues.json 2026-08-04 03:47) — el número real es 54 según `/dashboard`, diferencia explicada por issues creadas entre 03:47 y 09:24.

## Estado de las 4 mediciones que pide ZAL-298

### 1. Delta de $/día del 04→07 contra el promedio 07-29→08-03
- **Baseline 07-29 → 08-03:** no tenemos $/día exacto, solo runs/día. Se necesita derivar $/run del audit `3a992918`: `monthSpendCents: 167966` (al momento de la aprobación, ~07:08Z 08-04) sobre el run activity hasta ese momento.
- **Acción el 08-07:** comparar `monthSpendCents_2026-08-07_07:00Z − monthSpendCents_2026-08-04_07:08Z` contra `3 × baseline_$/día`.

### 2. `failedByErrorCode.provider_quota` diario
- **Baseline 31,8/día.** Si contención A funciona, debe caer proporcionalmente a la cadencia: 31,8 × (27/53) ≈ **16,2/día esperado** post-A.
- **Acción el 08-07:** comparar promedio 04→07 contra 16,2/día. Si ≥ 24/día, contención no atacó el driver dominante.

### 3. Conteo de `blocked`
- **Baseline 52–54.** Si contención solo escondió el síntoma, sigue en ese rango. Si cayó a <40, contención + cierre de productividad reviews drenó la cola.
- **Acción el 08-07:** leer `tasks.blocked` del `/dashboard` y comparar.

### 4. Estado de [ZAL-290](/ZAL/issues/ZAL-290) (failover/circuit-breaker)
- **Hoy (08-04 09:24Z):** `in_review` (critical). Engineering Lead (acade097) ya entregó diseño en `continuation-summary` con 7 secciones + plan doc rev `03e07276`. Run `77494659` failed 07:15Z por `claude_auth_required`; pendiente `request_confirmation` del board.
- **Es la cura real.** Si el 08-07 sigue `in_review`, la contención de cadencia es paliativo: el driver (provider_quota 79 % de fallos) sigue sin atacarse.
- **Acción el 08-07:** revalidar; si no pasó a `done` o `in_progress` con executionPolicy review path activo, **escalación formal al board**: pedir pronunciamiento sobre ZAL-290 con coste de no decidir (provider_quota se come el budget de septiembre).

## Cadena causal

```
burn 167 % → auditoría board 08-04 → aprobación 3a992918 Opción A (CEO recomienda A) →
  cortó cadencia 53→27 hb/día (reversible, sin secretos, sin gasto) →
  ZAL-290 (diseño failover) en review →
  ZAL-295/296/297 (implementación circuit-breaker + métricas + failover router) en todo
```

Contención A **es reversible** y **no toca producción, secretos, dinero real, ni datos personales**. Si la verificación 08-07 muestra que A no bajó burn, el siguiente paso **no es B (subir cap) sin condición** — es implementar ZAL-295/296/297 (la cura real) y volver a medir.

## Decisiones pendientes del board (relacionadas)

1. **[ZAL-289](/ZAL/issues/ZAL-289)** — auditoría 08-04 sigue en `in_review`. Board no eligió A/B/C explícitamente en `decisionNote`; CEO aplicó A por ser la única ejecutable sin dato adicional.
2. **[ZAL-290](/ZAL/issues/ZAL-290)** — diseño failover pendiente de aprobación board (`request_confirmation` o PATCH a `done`).
3. **Cap operativo de agosto** — la aprobación 3a992918 desbloqueó contención pero no fijó nuevo cap. CEO no puede fijar cap (es decisión board). Si verificación 08-07 muestra contención insuficiente, board debe pronunciarse sobre (a) cap alternativo o (b) espera a ZAL-290 + ZAL-296.

## Estado de dependencias para ZAL-298 el 2026-08-07

| Dependencia | Estado hoy | Acción 08-07 |
|---|---|---|
| `/api/companies/{id}/dashboard` con `runActivity[]` hasta 08-07 07:00Z | pending 08-07 | snapshot directo |
| `monthSpendCents` al 08-07 07:00Z | pending 08-07 | snapshot directo |
| ZAL-290 status | in_review | revalidar; escalar si sigue bloqueado |
| ZAL-295/296/297 status | todo | revalidar; reportar avance vs ETA |
| Bitácora ZAL-149 board-action items | blocked | revalidar conteo |
| Backlog priorizado | active | revalidar % producto vs meta-trabajo |

## Plan de acción CEO el 2026-08-07

1. **Snapshot dashboard** (`/api/companies/{id}/dashboard`) y `/api/agents` para heartbeat config.
2. **Calcular:**
   - `Δ$/día = (monthSpend_08-07 − 1688,77 USD) / 3 días`
   - `Δprovider_quota/día` vs baseline 31,8
   - `Δblocked` vs baseline 52
   - Estado ZAL-290 + ZAL-295/296/297
3. **Veredicto:**
   - **Éxito de contención** = `Δ$/día` ≤ 0,6 × baseline (~40 % reducción) Y `provider_quota/día` ≤ 20 Y `blocked` ≤ 40.
   - **Éxito parcial** = uno o dos de los tres se cumplen. **Discutir causa raíz de los que no.**
   - **Fracaso** = ninguno se cumple → escalación formal: priorizar ZAL-290 y bloquear actividad de producto hasta tener failover. Posicionar B (subir cap) **solo si** el board también aprueba presupuesto para ZAL-296.
4. **Documentar** en vault: `vault/06-Roadmap-y-Tareas/ZAL-298 verificación 2026-08-07.md`.
5. **Transicionar ZAL-298 a `done`** con veredicto + link al documento.
6. **Transicionar ZAL-289 a `done`** si auditoría quedó respondida; o reabrir si quedó ítems sin tratar.

## Lo que NO hace este issue

- No toca `runtimeConfig.heartbeat`. La contención ya está aplicada; modificarla otra vez es decisión board.
- No autoriza cambio externo, secreto, dato real, dinero, ni publicación.
- No fija cap mensual — eso es board.

## Cross-references

- Aprobación original: [3a992918](/ZAL/approvals/3a992918-ddcb-487a-8dfb-fcd8772f57fd)
- Bitácora board-action items: [ZAL-149](/ZAL/issues/ZAL-149)
- Inspección 08-06 (adelantada): [ZAL-274](/ZAL/issues/ZAL-274) — comentario paralelo
- Cadena de bugs SHA: [ZAL-231](/ZAL/issues/ZAL-231), [ZAL-136](/ZAL/issues/ZAL-136), [ZAL-237](/ZAL/issues/ZAL-237)
- Backlog priorizado: `vault/06-Roadmap-y-Tareas/Backlog priorizado.md`
- Changelog interno: `vault/06-Roadmap-y-Tareas/Changelog interno.md`
- Decisiones: `vault/06-Roadmap-y-Tareas/Decisiones.md`
