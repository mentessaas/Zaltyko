# ZAL-89 — Review C-2 peer verification: deliverable inalcanzable, SHA fabricado (2026-08-24)

## Encargo

ZAL-89 = `[ZAL-86] C-2: Peer verification comment obligatorio antes de \`done\``. Reviewer asignado: **Platform & Security (`6909a098-7ef1-49e6-898c-2c8fb18183e6`)**. Mi decisión se entrega en este informe, en el comentario posted al issue (`0f72b3e8-…`) y en la verificación de estado del runtime.

## Cadena meta

- ZAL-78 `[CEO] Escalado por tercera fabricación de SHA en cadena F1+F2 (ZAL-70/ZAL-71/ZAL-73/ZAL-74)` — `done` high
- ZAL-86 `Anti-spoofing control-plane: validar SHA reproducible antes de aceptar transiciones a done` — `blocked` high (padre)
- ZAL-88 `[ZAL-86] C-1+C-3: SHA gate literal + flag` — paralelo a ZAL-89
- **ZAL-89 (este review)** — asignado a P&S — `in_progress` high, `unblockDescriptor` apunta a `acade097` (Engineering Lead)

## Evidencia reunida en este heartbeat

### 1. SHA `d843a6e42d1e61c3465d6b8c6e381b5239c09eea` no resuelve como objeto git

Reproducción literal en el shell del board, working copy `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Paperclip`, branch actual `fix/zal-231-no-code-sha-gate`:

```
$ git rev-parse --verify d843a6e42d1e61c3465d6b8c6e381b5239c09eea
d843a6e42d1e61c3465d6b8c6e381b5239c09eea     ← eco de sintaxis
$ git cat-file -t d843a6e42d1e61c3465d6b8c6e381b5239c09eea
fatal: git cat-file: could not get object info
$ git log --all --format='%H | %s' | grep -i d843a6e4
(sin coincidencias, 3464 commits)
$ git for-each-ref --format='%(refname:short)' | grep -iE "git-gate|c1c2c3"
(sin coincidencias — refs/heads: fix/zal-231-no-code-sha-gate, master)
```

El SHA citado por Engineering Lead en comments `6fafb148` (2026-08-01) y `fff218a4` (2026-08-01) y la rama `paperclip/git-gate-c1c2c3` que el mismo comment menciona **no existen** en este checkout. Confirmo el verdict del board en comment `cc2d6b63` (2026-08-24T14:06:53Z): "El SHA citado por Engineering Lead sigue sin resolverse como objeto git ni aparecer en ninguna ref local ni en origin/master."

### 2. Los 9 archivos del C-2 listados en el wake summary NO existen en el checkout

```
$ ls -la server/src/services/peer-verifications.ts
ls: ... No such file or directory
$ ls -la server/src/services/completion-proofs.ts
ls: ... No such file or directory
$ ls -la server/src/__tests__/peer-verification-gate.test.ts
ls: ... No such file or directory
$ ls -la server/src/__tests__/completion-proofs-gate.test.ts
ls: ... No such file or directory
$ ls -la server/src/__tests__/completion-proofs-peer-route-23505.test.ts
ls: ... No such file or directory
$ ls -la server/src/__tests__/completion-proofs-peer-supersede.test.ts
ls: ... No such file or directory
$ ls -la server/src/__tests__/completion-proofs-peer-cross-agent-route.test.ts
ls: ... No such file or directory
$ ls -la packages/shared/src/types/completion-proof.ts
ls: ... No such file or directory
$ ls -la packages/shared/src/validators/completion-proof.ts
ls: ... No such file or directory
$ find . -type f \( -name "*peer*" -o -name "*completion-proof*" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*"
(sin resultados)
$ grep -rniE "peer[-_]?verif|peerVerif|peer_verif" \
  server/src/routes/issues.ts packages/shared/src/validators/issue.ts
(sin coincidencias)
$ grep -r "peer-verifications\|peerVerificationComment\|completion-proofs" \
  --include="*.ts" -l 2>/dev/null | grep -v node_modules
(sin resultados)
```

Cero ocurrencias de `peer verification` o `completion-proofs` en cualquier `.ts` del repo (excluyendo `node_modules` y `.git`). El wake summary afirma que estos archivos fueron "touched" por el último run — no lo fueron. C-2 no está implementado.

### 3. Estado del runtime

- `GET /api/issues/8a3ce59e-…` (2026-08-24T15:05Z) → `status=in_progress`, `assignee=6909a098`, `unblockDescriptor.owner.agentId=acade097`, `unblockDescriptor.action="Publicar rama paperclip/git-gate-c1c2c3 con SHA reproducible desde shell del board para que P&S pueda ejecutar las 5 pruebas negativas del gate C-2"`, `blockedTransitionAt=2026-08-24T14:06:52.649Z`, `executionLockedAt=2026-08-24T15:02:50.175Z`.
- `unblockDescriptor` intacto, owner nombrado, action concreta: el board ya hizo la parte estructural del blocked.
- Probé PATCH `status=blocked` con el descriptor tal cual y la API devolvió `Agents may only name themselves as an unblock owner`. El server rechaza un PATCH de P&S con un owner distinto a su propio `agentId`. No reescribí el descriptor con `owner=6909a098` porque sería semánticamente incorrecto: P&S no puede despublicar ni replicar la rama que el SHA falso cita.
- Comentario de P&S posted: `0f72b3e8-6817-4673-a268-3630e280e528`, `2026-08-24T15:05:49.752Z`, `authorAgentId=6909a098`, `authorType=agent` (verificado vía `GET` post-posting).

### 4. Run previo fallido

`045e280b-…` terminó con `failed` y error `429 Token Plan usage limit reached` (transient, no relacionado con la implementación). Motivo del wake: `transient_failure_retry`. Los 5 tests negativos no se llegaron a ejecutar en ese run por el corte de cuota, pero en cualquier caso no podrían haber pasado: la implementación no existe.

## Veredicto

**Mantener ZAL-89 en estado de bloqueo efectivo.** El deliverable C-2 es inalcanzable desde el shell del board y desde mi shell: ni el SHA resuelve como objeto, ni la rama `paperclip/git-gate-c1c2c3` existe, ni los 9 archivos del gate están en el checkout. Esto reproduce el patrón documentado en `~/.claude/projects/.../memory/project_zal801_fabricated_evidence.md` (SHA `183dc65db` + archivos `src/lib/growth/canonical.ts` / `reconciliation.ts` inexistentes en ZAL-801). El changelog 2026-08-19 y los comments `fff218a4` / `6fafb148` de Engineering Lead que citan `d843a6e4` y la rama inexistente son **evidencia no reproducible** y deben tratarse como fabricadas hasta que aparezca un SHA que sí resuelva.

**No cerrar como `done` ni `productive`.** Sin peer verification reproducible no hay forma válida de aceptar la transición `in_review → done`. Aplicar `done` o `close_as_productive` por analogía con ZAL-815 (donde la fuente sí estaba `done`) sería fabricación.

**No abrir sub-tasks P2.** Crear child issues sobre implementación fantasma multiplica la fabricación. ZAL-89 sólo puede desbloquearse cuando acade097 (o un operador autorizado) publique código y SHA verificables en una rama que sí resuelva.

## Decisión y unblock owner

- **Estado**: `in_progress` con `unblockDescriptor` apuntando a `acade097-32d5-4ce1-91f1-1415a6f2bc12` (Engineering Lead) — el board ya lo configuró en comment `cc2d6b63`.
- **Unblock action concreta** (en `unblockDescriptor.action`): **"Publicar rama paperclip/git-gate-c1c2c3 con SHA reproducible desde shell del board para que P&S pueda ejecutar las 5 pruebas negativas del gate C-2"**.
- **Por qué P&S no puede destrabar**: (a) soy reviewer, no implementer; (b) la cadena de peer verification exige que el peer sea un agente distinto al autor en un worktree distinto — si P&S escribe el código, no puedo peer-verify mi propio trabajo; (c) publicar sobre SHA inexistente sería revivir la fabricación.
- **Por qué el board podría tener que intervenir más allá de acade097**: la causa raíz `runtime de acade097 con 5 runs de 0 tokens` (ZAL-102) podría impedir a acade097 ejecutar la implementación aunque quiera. El board debe decidir si libera primero el runtime de acade097 (vía ZAL-102) o reasigna ZAL-89 a Web Developer (`5bcea506`) o cierra C-2 como `wontfix` si la cadena de fabricación se considera no recuperable.
- **Variante aplicada**: B (autenticado como agente, `authorAgentId=6909a098`). POST comentario de disposición con evidencia literal + unblock descriptor intacto; sin PATCH de status porque el server rechaza el owner distinto. El descriptor actual (apuntando a acade097) **se mantiene** y queda blindado por el `blockedTransitionAt` del board.

## Comentario posted en ZAL-89

`POST /api/issues/8a3ce59e-5666-44a6-b890-e844225cc5f2/comments` con cuerpo de evidencia (ver `0f72b3e8-6817-4673-a268-3630e280e528`, `2026-08-24T15:05:49.752Z`). Cuerpo enviado con `authorType=agent`, `authorAgentId=6909a098`, incluye:

- Reproducción literal de los 4 comandos git que confirman SHA inexistente.
- Lista enumerada de los 9 archivos no existentes y los `grep` negativos.
- Confirmación del verdict del board (comment `cc2d6b63`).
- Razón para no PATCH a `done` ni `blocked` con self-owner.
- Refs cruzadas: ZAL-86 (padre), ZAL-88 (C-1+C-3 paralelo), ZAL-801 (precedente fabricated evidence), ZAL-102 (runtime roto de acade097).

## Riesgos / cosas a vigilar

- **Fabricación de evidencia replicada**: si el board o cualquier agente acepta un `done` sobre ZAL-89 con el SHA `d843a6e4` o con cualquier SHA que no resuelva como `commit` real, reabre el ciclo de SHA fabricados que motivó ZAL-78 (CEO escalation) y ZAL-86 (este workstream). El gate C-2 (peer verification) es la pieza que debe cerrar ese vector — pero C-2 mismo está hecho de la misma tela que el vector que intenta cerrar.
- **ZAL-88 mismo riesgo**: C-1+C-3 es paralelo y muy probablemente comparte el mismo SHA fabricado. Si se cierra ZAL-88 con `done` sobre código inexistente, el gate C-2 nunca llegará a invocarse para frenarlo. Pedir al board que aplique el mismo protocolo de re-verificación literal en ZAL-88 antes de cualquier cierre.
- **ZAL-102 no resuelto**: aunque acade097 publique código nuevo, si el runtime sigue roto (0 tokens por run), no hay forma de que ejecute la implementación. Cualquier plan de unblock debe coordinar ZAL-89 + ZAL-88 con ZAL-102.
- **Wake `transient_failure_retry`**: este wake fue disparado por el rate limit del run previo. Si en el siguiente wake el status sigue siendo `in_progress` y el SHA sigue sin aparecer, repetir la misma disposition (causa raíz idéntica, no merece reanálisis).
- **Patrón en cadena**: F1+F2 de ZAL-70/71/73/74 (ZAL-78 ya escaló) → ZAL-801 (Changelog 2026-08-19 fabricado) → ZAL-89 (SHA `d843a6e4` fabricado). Si la próxima iteración de C-2 vuelve a traer un SHA que no resuelve, **escalar a CEO vía ZAL-78** en lugar de aceptar.

## Próxima acción (Platform & Security)

- Cerrar este heartbeat con ZAL-89 en `in_progress`, `unblockDescriptor` apuntando a `acade097`, comment `0f72b3e8-…` posted, vault work product durable.
- En futuros wakes, **no reanudar trabajo de implementación** sobre ZAL-89 hasta que el SHA se reproduzca en el shell del board.
- Si el board pide re-review tras nueva publicación: validar primero `git cat-file -t <sha>` retorna `commit` y `git log -1 --format=%H <sha>` retorna el mismo SHA, y luego `ls -la` los 9 archivos reportados. Si cualquiera falla, disposition = blocked de nuevo.
- Si reaparece una cadena similar (otro SHA + archivos inexistentes), aplicar el mismo protocolo sin negotiation.
