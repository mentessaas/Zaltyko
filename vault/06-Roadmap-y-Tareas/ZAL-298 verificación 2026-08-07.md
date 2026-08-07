---
status: active
owner: ceo
last_reviewed: 2026-08-07
baseline_doc: ./ZAL-298 baseline snapshot 2026-08-04.md
related:
  - ../../ZAL/issues/ZAL-298
  - ../../ZAL/issues/ZAL-274
  - ../../ZAL/issues/ZAL-289
  - ../../ZAL/issues/ZAL-290
  - ../../ZAL/approvals/3a992918-ddcb-487a-8dfb-fcd8772f57fd
  - ../../ZAL/approvals/1364ea18-...
---

# ZAL-298 verificación 2026-08-07 — contención Opción A: **FRACASO**

**Issue:** [ZAL-298](/ZAL/issues/ZAL-298) — [CEO] Verificar contención de burn 2026-08-07
**Baseline:** [ZAL-298 baseline snapshot 2026-08-04](./ZAL-298%20baseline%20snapshot%202026-08-04.md)
**Fecha de medición:** 2026-08-07 (corte ~16:50Z para 4 días post-A: 04→07; corte parcial del 07 a esa hora)

## TL;DR

**La contención Opción A no cumplió su mandato.** Redujo $/día ~29 % (target −49 %), pero los otros dos criterios del baseline fallaron estrepitosamente: `provider_quota/día` se duplicó con creces y la cola `blocked` creció en vez de drenar. El driver real (ZAL-290 — failover entre proveedores) sigue `blocked` desde el 2026-08-05.

## Veredicto: FRACASO en 2 de 3 dimensiones + parcial en la tercera

| Métrica | Criterio éxito (baseline) | Observado 2026-08-04 → 07 | Veredicto |
|---|---|---|---|
| Δ$/día | ≤ 0,6 × baseline (≤ ~$306/día; −40 % vs 08-01→03) | $360,75/día (−29 % vs $509,57/día) | **Parcial** — bajó pero no lo suficiente |
| `provider_quota`/día | ≤ 20/día (target post-A; baseline 31,8) | **136/día** (rango 60–260) | **FALLO** — peor que baseline |
| `blocked` | ≤ 40 (baseline 52) | **86** (+34 vs baseline, +65 %) | **FALLO** — contención no drenó la cola |
| [ZAL-290](/ZAL/issues/ZAL-290) (failover) | avance (in_progress / done) | sigue `blocked`, assignee P&S, sin movimiento desde 08-05 | **FALLO** — la cura real no avanzó |

## Datos crudos (corte 2026-08-07 ~16:50Z, fuente: Paperclip `cost_events` y `heartbeat_runs`)

### 1. Costo por día (`cost_events.cost_cents`)

| Día | USD | Eventos |
|---|---|---|
| 2026-07-29 | 144,48 | 115 |
| 2026-07-30 | 101,76 | 141 |
| 2026-07-31 | 145,19 | 167 |
| **2026-08-01** | **750,28** | 161 |
| **2026-08-02** | **326,37** | 261 |
| **2026-08-03** | **452,07** | 233 |
| **2026-08-04** (post-A aplicado ~07:08Z) | **306,60** | 168 |
| **2026-08-05** | **554,88** | 213 |
| **2026-08-06** | **293,51** | 165 |
| **2026-08-07** (parcial hasta 16:50Z) | **288,00** | 106 |

**Promedios:**
- Pre-contención (08-01 → 08-03): $1.528,72 / 3 días = **$509,57/día**
- Post-contención (08-04 → 08-07, parcial): $1.442,99 / 4 días = **$360,75/día**
- Δ $/día: **−$148,82 (−29,2 %)** — mejor pero no llega al −49 % proyectado por la sola cadencia.

### 2. Fallos `provider_quota` por día (`heartbeat_runs.error` LIKE '%429%' OR '%quota%')

| Día | provider_quota | failed | total runs |
|---|---|---|---|
| 2026-07-29 | 67 | 90 | 200 |
| 2026-07-30 | 0 | 54 | 187 |
| 2026-07-31 | 44 | 90 | 239 |
| 2026-08-01 | 117 | 143 | 301 |
| 2026-08-02 | 225 | 312 | 575 |
| 2026-08-03 | 257 | 296 | 497 |
| 2026-08-04 | 110 | 135 | 293 |
| **2026-08-05** | **260** | 293 | 472 |
| 2026-08-06 | 114 | 146 | 304 |
| 2026-08-07 (parcial) | 60 | 80 | 169 |

**Promedio post-A:** (110+260+114+60)/4 = **136/día**, ×4,3 sobre el target ≤20. La contención de cadencia **no** atacó el driver dominante: el proveedor (Anthropic) sigue limitando por token-plan, cada run fallido consume tokens antes de fallar, los reintentos se acumulan, y no hay failover que corte el ciclo.

**Nota:** el baseline doc predecía ~16,2/día asumiendo cadencia ∝ fallos. Ese modelo era ingenuo — el cuello de botella es la cuota del proveedor, no la frecuencia de runs. Reducir runs a la mitad **deja la cuota igual de exprimida** mientras haya cualquier run que toque el proveedor throttled.

### 3. Cola `blocked`

| Snapshot | blocked | fuente |
|---|---|---|
| 2026-08-04 baseline (09:24Z) | 52 | dashboard Paperclip |
| 2026-08-07 (~16:50Z) | **86** | `SELECT status, COUNT(*) FROM issues` |

**Δ +34 (+65 %).** La contención A no drenó la cola; la infló. Motivo: la mitad de las issues nuevas de governance/peer-verification/SHA gate que entraron entre 04→07 son meta-trabajo, y cada intento de cierre genera sub-issues de peer-verification que quedan `todo` o `blocked`.

### 4. ZAL-290 (failover entre proveedores y circuit-breaker)

- Estado: **`blocked`**
- Asignado: `acade097` (Engineering Lead)
- Prioridad: `critical`
- Última actualización: **2026-08-06** (3 días sin movimiento)
- `unblockDescriptor`: (vacío en API pública)

El diseño de failover con 7 secciones está listo desde 2026-08-04 (`continuation-summary` run 77494659) y el plan doc tiene revisión `03e07276`. Lo que falta es pronunciamiento board sobre la `request_confirmation` abierta. **Esta es la cura real** — sin ella, contención es paliativo.

## Top agentes por costo (agosto completo, fuente: `cost_events`)

| Agente | USD agosto | Eventos |
|---|---|---|
| Developer | 745,91 | 316 |
| CEO | 712,97 | 154 |
| Platform & Security | 532,27 | 251 |
| Web Developer | 322,57 | 109 |
| QA | 194,08 | 118 |
| Mobile Developer | 130,84 | 85 |
| Marketing | 112,13 | 88 |
| Product Lead | 106,61 | 79 |
| Data & Analytics | 39,43 | 34 |
| Content | 33,87 | 20 |

**Top 3 = 67 % del gasto total.** El CEO está segundo — la mayor parte proviene de peer-verifications, heartbeats de board-action items y measurement runs como este. El Developer sigue siendo el #1 por el esfuerzo de mantener ZAL-290 + ZAL-296 adelante.

## Top modelos por costo (agosto completo)

| Modelo | Proveedor | USD | Eventos |
|---|---|---|---|
| `MiniMax-M3` | anthropic | 2.123,14 | 939 |
| `MiniMax-M3` | minimax | 503,66 | 2 |
| `claude-sonnet-4-6` | anthropic | 235,76 | 218 |
| `gpt-5.4-mini` | anthropic | 106,17 | 56 |

El 88 % del costo va a Anthropic (cuota primaria). **Esto confirma que el driver dominante es la cuota Anthropic, no la cadencia.** Failover al modelo secundario existe en configuración pero no está activado.

## ¿Por qué falló la contención?

1. **El modelo mental era erróneo.** Asumió que cuota_fails ∝ cadencia. No lo es: cuota_fails ∝ oferta de cuota del proveedor, que es fija e independiente de cuántos runs agendamos. Reducir runs no reduce el rate-limit; solo reduce el *número de intentos* que se queman antes de fallar.
2. **El failover no se implementó.** Sin circuit-breaker, cuando Anthropic devuelve 429, los runs siguen intentando y consumen tokens de cuota residual. La aprobación 3a992918 destrabó contención (reversible, sin secretos) pero no aprobó ZAL-290 (que sí toca modelo de proveedor y tiene coste de implementación).
3. **Meta-trabajo se autorreplica.** Cada intento de cierre genera peer-verifications, SHA gates y recovery pauses. La cola `blocked` crece aunque los runs bajen. La aprobación `1364ea18` (board: raise cap + failover) abrió una puerta pero sigue pendiente.

## Acción inmediata (CEO)

1. **Este documento es la verificación formal.** Posiciona la contención A como paliativo, no como cura.
2. **Escalación al board ya activa:** aprobación `1364ea18` (raise cap a $2.500 + failover) lleva abierta desde 2026-08-06 sin respuesta.
3. **Recomendación CEO:** antes de subir cap, **board debe pronunciarse sobre ZAL-290** (failover). Subir cap sin failover es pagar más por lo mismo. Si el board decide priorizar producto sobre governance, el cap debe ir acompañado de (a) aceptación de que meta-trabajo seguirá creciendo, (b) plan para drenar cola `blocked` con criterios explícitos.
4. **Reasignación interna:** ZAL-290 lleva 3 días sin movimiento pese a critical priority. Sugerencia: que Web Developer co-firme con Engineering Lead para destrabar, o que board asigne revisor explícito con SLA de 48h. CEO no tiene autoridad para forzar — solo elevar.

## Acción board (lo que se necesita)

1. **Pronunciamiento sobre ZAL-290** (failover entre proveedores): aprobar `## Review: APPROVED` o equivalent para que Engineering Lead cierre.
2. **Pronunciamiento sobre `1364ea18`** (raise cap $2.500 + failover): aprobar con o sin condición. Si se rechaza, CEO necesita instrucción explícita de seguir en contención A con cadencia más baja o congelar agentes no críticos.
3. **Decisión sobre meta-trabajo:** aceptar el ratio actual 40 % meta-trabajo / 20 % producto como costo del SHA gate, o instruir pausa de governance para liberar Developer/CEO/P&S a producto.

## Lo que NO hace este documento

- No modifica `runtimeConfig.heartbeat`. La contención A sigue activa; revertirla es decisión board.
- No toca producción, secretos, datos reales, dinero ni publicaciones.
- No autoriza ningún cambio externo.
- No fija cap mensual nuevo (decisión board).

## Cross-references

- Baseline congelado: [ZAL-298 baseline snapshot 2026-08-04](./ZAL-298%20baseline%20snapshot%202026-08-04.md)
- Aprobación original: [3a992918](/ZAL/approvals/3a992918-ddcb-487a-8dfb-fcd8772f57fd)
- Aprobación raise cap: `1364ea18` (board: pendiente)
- Bitácora board-action items: [ZAL-149](/ZAL/issues/ZAL-149)
- Inspección CEO 2026-08-06: [ZAL-274](/ZAL/issues/ZAL-274)
- Auditoría board: [ZAL-289](/ZAL/issues/ZAL-289)
- Failover: [ZAL-290](/ZAL/issues/ZAL-290)
- Circuit-breaker: [ZAL-295](/ZAL/issues/ZAL-295)
- Métricas: [ZAL-296](/ZAL/issues/ZAL-296)
- Failover router: [ZAL-297](/ZAL/issues/ZAL-297)
- Cierre cola in_review: [ZAL-292](/ZAL/issues/ZAL-292) (done 2026-08-06)
- Backlog priorizado: `vault/06-Roadmap-y-Tareas/Backlog priorizado.md`
- Changelog interno: `vault/06-Roadmap-y-Tareas/Changelog interno.md`
- Decisiones: `vault/06-Roadmap-y-Tareas/Decisiones.md`
