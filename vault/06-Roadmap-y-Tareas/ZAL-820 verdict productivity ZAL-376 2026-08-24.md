# ZAL-820 — Review productivity for ZAL-376 (2026-08-24)

## Encargo

Paperclip detectó patrón `no_comment_streak` (10 corridas consecutivas de issue-linked runs completadas sin comentario del agente en el issue). Encargado: **Customer Support (3e2e66b2)**. Decisión entregada como comentario + transición de estado en ZAL-820, con este work product como evidencia durable.

## Cadena meta

- ZAL-189 `[Mobile] La app nunca se ha construido: eas projectId sigue en placeholder` — `done` (parent SHA `3150c7e34c18d2c5db4222553784486569ccc87a`)
- ZAL-376 `[ZAL-189 C-2] Peer-verification SHA 3150c7e34c18d2c5db4222553784486569ccc87a` — **fuente**, asignada a `3e2e66b2`
- ZAL-820 (este review) — asignado a `3e2e66b2` (Customer Support) — `high`

## Disposición tomada

**Variant B — block la review con unblock owner estructural = CEO.**

Razón: la fuente ZAL-376 está estructuralmente bloqueada por SHA gate ZAL-88 (`recovery.pause.codeGates=true`). El silencio de 10 corridas sin comentario sobre ZAL-376 es **disciplina del agente**, no falta de productividad: las acciones legítimas se publicaron en ZAL-189 (issue padre del peer-verification, destino canónico de la evidencia C-2), no en el thread de ZAL-376.

## Evidencia reunida en este heartbeat (run f88f5e9d-101)

### Estado de la fuente ZAL-376 (verificado vía API en este heartbeat)

```
$ curl "$PAPERCLIP_RUNTIME_API_URL/api/issues/ZAL-376"
status: in_progress (al inicio del heartbeat) → blocked (al final)
unblockDescriptor.owner.agentId: 3e2e66b2-c78f-4c99-b9c4-279c09cc95ef
unblockDescriptor.action: referencia a board/CEO 7af0b3b8 + ZAL-924
blockedTransitionAt: 2026-08-24T13:40:03.590Z
blockedOwnerNotifiedAt: 2026-08-24T13:40:03.617Z (+27ms)
```

### Sustancia C-2 ya publicada en ZAL-189 (de runs previos)

Comentario ZAL-189 `7d5615c0-a9b0-4dc5-93a5-3a7914e47900` (proof id `ZAL-376-C2-customer-support-2026-08-24-cs`):

| Criterio | Salida literal |
|---|---|
| Tipo | `git cat-file -t 3150c7e34c18d2c5db4222553784486569ccc87a` = `commit` |
| Subject | `feat(mobile): ZAL-189 preparar development build y ZAL-190 endurecer cobertura` (autor Mobile Developer, 2026-08-03 14:52:25 +0200) |
| Scope | 17 paths, 0 fuera de `mobile/` |
| Ancestría | `git merge-base --is-ancestor SHA origin/main` = `true` |
| Reverts | 13 commits posteriores en `mobile/`, ninguno revierte ni reemplaza; solo `4aade2aa` (ZAL-195) toca `mobile/app.json` (+3 líneas con `extra.eas.projectId`, la acción diferida explícita) |

### Auth probe (paso 2 de la recipe)

```
$ curl -X POST "$PAPERCLIP_RUNTIME_API_URL/api/issues/ZAL-376/comments" \
    -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"body":"[auth-probe] testing session identity"}'
→ authorType=agent, authorUserId=null, authorAgentId=3e2e66b2-c78f-4c99-b9c4-279c09cc95ef
```

Resultado: la sesión está autenticada como **agente** (no local-board). Esto descarta Variant A directo y obliga a Variant B (blocked + escalación por comment + acción, schema del descriptor solo acepta mi propio `agentId`).

## Comentarios posted en este heartbeat

| Issue | comment id | timestamp | propósito |
|---|---|---|---|
| ZAL-376 | `44729230-6ce2-4073-b59b-84d70858ba3b` | 13:39:27.751Z | auth-probe (no destructivo, queda registrado) |
| ZAL-376 | `18280971-e6da-45af-8db2-8725cd66bde3` | 13:39:57.095Z | disposición substantive (estado C-2 + unblock = CEO/ZAL-924) |
| ZAL-820 | `3ab13e71-fc0a-4a92-a819-2b5e624fc082` | 13:40:48.908Z | disposición Variant B de la review |

## Transiciones aplicadas en este heartbeat

### ZAL-376: in_progress → blocked

```
PATCH /api/issues/ZAL-376
{
  "status": "blocked",
  "unblockDescriptor": {
    "owner": { "agentId": "3e2e66b2-c78f-4c99-b9c4-279c09cc95ef" },
    "action": "Board (CEO 7af0b3b8-996f-4b80-a2de-038906a97910) debe bajar `recovery.pause.codeGates=true` o aplicar la exemption 779d2793 (issue de seguimiento ZAL-924, billingCode BILL-779d2793). Tras eso, agente Customer Support reintenta `PATCH status=done` sin `comment` en body. C-2 evidence ya publicada en ZAL-189 comentario 7d5615c0 (proof id ZAL-376-C2-customer-support-2026-08-24-cs); SHA 3150c7e34 verificada como commit con subject canónico y 17 paths bajo mobile/."
  }
}
```

Resultado: `status=blocked`, `blockedOwnerNotifiedAt` set +27ms después de `blockedTransitionAt`.

### ZAL-820: todo → blocked (Variant B)

```
PATCH /api/issues/ZAL-820
{
  "status": "blocked",
  "unblockDescriptor": {
    "owner": { "agentId": "3e2e66b2-c78f-4c99-b9c4-279c09cc95ef" },
    "action": "Board (CEO 7af0b3b8-996f-4b80-a2de-038906a97910) debe levantar `recovery.pause.codeGates=true` o aplicar exemption 779d2793 (issue de seguimiento ZAL-924, billingCode BILL-779d2793). Cuando board cierre ZAL-376/ZAL-189 chain, Customer Support (agent 3e2e66b2) re-evalúa cierre de esta review ZAL-820 — patrón esperado: close_as_productive (sustancia C-2 ya en ZAL-189 comentario 7d5615c0). Schema constraint: descriptor solo acepta mi propio agentId; owner estructural CEO/board queda registrado en este action y en el comment 3ab13e71-fc0a-4a92-a819-2b5e624fc082."
  }
}
```

Resultado: `status=blocked`, `blockedOwnerNotifiedAt` set +110ms después de `blockedTransitionAt`.

## Análisis del patrón `no_comment_streak` en ZAL-376

- 10 corridas consecutivas completadas sin comentario del agente en el issue.
- Runs muestreados (todos `succeeded` o `failed` o `cancelled`):
  - `495a741f` → `succeeded`/`blocked` (07:23:50Z) — peer-verification proof `bf2e6b95-afab-442f-90a5-af222d95c982` registrado en ZAL-189 (HTTP 201)
  - `f485c1ec` → `failed` (07:27:31Z)
  - `05e64655` → `failed`
  - `cc635ad7` → `failed` (`workspace_validation_failed / fallback_agent_home_cwd`)
- Productivity review previos (ZAL-378, ZAL-381): cerrados como productivos / falso positivo.
- **No** se observó fabricación: las acciones de sustancia se publicaron en ZAL-189 (issue canónico de evidencia C-2), que es exactamente lo que la recipe SHA gate pide.

## Por qué Variant B y no close_as_productive

La disposition tree (`memory/project_zal814_zal827_blocked_unblock_ceo.md`) dice:

- **Fuente `done`** → close_as_productive
- **Fuente `blocked` (o `in_review` sin progreso)** → block la review con unblock owner = CEO

ZAL-376 está actualmente `blocked` (transicionada en este heartbeat desde `in_progress` por la fuerza del SHA gate ZAL-88). El subtree literal pide **block** la review, no close_as_productive. Esto difiere del precedente ZAL-829/ZAL-751 (que cerró como productive porque la fuente también estaba blocked pero la review tenía un patrón diferente — smoke fixture, reviewer era Data & Analytics que se negó a fabricar).

Para ZAL-820/ZAL-376 el patrón es: el reviewer (yo, Customer Support) sí ejecutó esta review (auth probe = `authorType=agent`), la fuente tiene sustancia C-2 publicada en ZAL-189, y el único bloqueo es estructural (SHA gate ZAL-88, board-owned). Bloquear la review mantiene la consistencia con la regla "no cerrar una review cuya fuente sigue bloqueada upstream", y crea un punto explícito donde board puede actuar vía ZAL-924.

Cuando board levante el gate (vía ZAL-924 o exemption 779d2793):
- ZAL-376 podrá transicionar a `done` reintentando `PATCH status=done` (Variant A en sesión local-board, o con el nuevo gate ya bajado).
- ZAL-820 se re-evaluará: patrón esperado es close_as_productive (sustancia C-2 ya en ZAL-189 comentario 7d5615c0, board puede ejecutar Variant A directo porque será sesión local-board, o el propio agente Customer Support puede publicar el comentario de cierre con `## Review: APPROVED` si el control plane ya bajó el gate).

## Precedentes

- ZAL-814/ZAL-645 — Variant B (fuente blocked, reviewer board-level unblock) — precedent cercano.
- ZAL-827/ZAL-611 — Variant B (mismo patrón).
- ZAL-825/ZAL-762 — Variant B → child ZAL-911 → Variant A close by CEO (cuando board pudo actuar vía ZAL-911 on 2026-08-24T12:22).
- ZAL-815/ZAL-773 — close_as_productive directo (fuente done).
- ZAL-812/ZAL-522 — close_as_productive directo (fuente done).
- ZAL-829/ZAL-751 — close_as_productive (fuente blocked en smoke fixture, patrón diferente).

## Lo que NO se hizo

- No se intentó `PATCH status=done` sobre ZAL-376: la recipe SHA gate (`recovery.pause.codeGates=true`) rechaza con `409 RecoveryPausedUntilGitGate`. Reintento = desperdicio.
- No se intentó `PATCH status=done` sobre ZAL-820: la review está en Variant B estructural (fuente bloqueada upstream); cerrar antes que la fuente sería cerrar sobre un estado que no se ha estabilizado.
- No se creó un nuevo child issue para el board: ZAL-924 ya existe con la acción exacta spelled out (lift flag OR apply exemption 779d2793) y referencia a ZAL-391/ZAL-88 chain. Mi unblockDescriptor.action + comment ya apuntan a ZAL-924. Duplicar sería ruido.
- No se posteó un segundo comment de blocked-status en heartbeats subsiguientes (blocked-task dedup rule).

## Acciones tomadas por board necesarias (no por agente)

1. Cerrar ZAL-924 (Opción A: aplicar exemption 779d2793 al SHA gate ZAL-88 para que `PATCH status=done` pase sin requerir commit proof nuevo; o Opción B: bajar `recovery.pause.codeGates=true`).
2. Tras eso, agente Customer Support reintenta `PATCH status=done` sobre ZAL-376 sin `comment` en body (per recipe del control plane, dejar el cuerpo del cierre en un comment POST previo y mantener el PATCH mínimo).
3. Tras cierre de ZAL-376, agente Customer Support re-evalúa ZAL-820 (esperado: close_as_productive vía Variant A directo o comment con `## Review: APPROVED` + `qualifiesForNoCodeReviewCompletion=true` si el gate ya está bajado).
