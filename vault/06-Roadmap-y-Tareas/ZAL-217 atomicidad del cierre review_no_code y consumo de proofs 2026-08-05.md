# ZAL-217 — Atomicidad del cierre `review_no_code` y consumo de proofs

> Issue: ZAL-217 — [ZAL-206 follow-up] Atomicidad del cierre review_no_code y consumo de proofs
> Asignado a: Engineering Lead (acade097) · worktree `zal-217-atomic`
> Fecha: 2026-08-05
> Resultado: cierre endurecido + suite extendida; **flujo válido parent A / peer B (ZAL-206) intacto**.

## 1. Resumen ejecutivo

`a0b11a85b` ya cerraba la TOCTOU entre el read de calificación (`qualifiesForNoCodeReviewCompletion`) y el UPDATE de status (`in_review → done`) mediante `verifyNoCodeReviewAtTransition` dentro de `db.transaction` con locks `FOR UPDATE` sobre (parent commit proof, reviewer evidence comment, review issue). Este commit `HEAD` añade tres hardenings de segunda línea que ese primer pase dejaba abiertos:

1. **Race INSERT de commit proof propio durante el close**: `submitCommit` ahora rechaza upfront cualquier INSERT sobre una issue `review_no_code` con `parentId` no nulo. Sin esto, un INSERT podía colarse entre el `ownProofRows` re-check del close y el UPDATE de status y flipear la transición a la rama estándar de SHA + peer.
2. **Race de status `done` previo**: `verifyNoCodeReviewAtTransition` ahora también re-checa `issues.status === "done"` post-lock. Si una transacción previa ya cerró, el lock se libera con el flag de status prendido y el nuevo intento falla con `review_issue_locked` (fail-closed).
3. **Test de dos conexiones real**: nueva prueba usa dos `createDb(connString)` (dos pools distintos contra el mismo postgres embebido) para que `FOR UPDATE` contienda de verdad entre sesiones — el `Promise.all([db.transaction(...), db.transaction(...)])` previo serializaba sobre el mismo cliente.

## 2. Diff resumido

```
packages/shared/src/types/completion-proof.ts      |   3 +-
server/src/services/completion-proofs.ts           |  34 +++-
server/src/routes/issues.ts                        |  40 ++--
server/src/__tests__/completion-proofs-gate.test.ts | 148 +++++++++++++
4 files changed, 213 insertions(+), 12 deletions(-)
```

### 2.1 `submitCommit` rechaza INSERTs propios en review_no_code children

`server/src/services/completion-proofs.ts` — la firma acepta `workMode?` y `parentId?` y rechaza antes del INSERT con un error tipado `ReviewNoCodeOwnCommitForbidden`.

```typescript
if (issue.workMode === "review_no_code" && issue.parentId) {
  const err = new Error(
    "ReviewNoCodeOwnCommitForbidden: review_no_code child issues must close on durable reviewer evidence, never on a commit proof",
  );
  (err as Error & { code: string }).code = "ReviewNoCodeOwnCommitForbidden";
  throw err;
}
```

`server/src/routes/issues.ts:5937` — la ruta `/issues/:id/completion-proofs/commits` mapea el código a `409 { code: "ReviewNoCodeOwnCommitForbidden" }` y propaga el resto. El caller (`POST`) necesita `{workMode, parentId}` del issue, que ya están disponibles tras `getAccessibleResource`.

### 2.2 `verifyNoCodeReviewAtTransition` re-checa status post-lock

`server/src/services/completion-proofs.ts:550` — tras el `FOR UPDATE` sobre la review issue, se verifica también `status === "done"`. Si una transacción previa cerró exitosamente, la fila queda con `consumedAtTransitionId` set y status `done`; nuestro lock se libera detrás de esa commit y la nueva verificación falla con `review_issue_locked` (mismo motivo que ya filtra el caso de review issue inexistente).

### 2.3 Tipo de error estable

`packages/shared/src/types/completion-proof.ts` — `IssueCompletionProofErrorCode` extiende con `"ReviewNoCodeOwnCommitForbidden"`. La lista es estable y la UI / SDK puede switchear sobre ella.

## 3. Tests añadidos (4 nuevos, total 30/30 PASS)

`server/src/__tests__/completion-proofs-gate.test.ts`:

1. **`submitCommit` sobre review_no_code child rechaza con `ReviewNoCodeOwnCommitForbidden`** — pin del contrato a nivel de servicio.
2. **`submitCommit` sobre issue normal sigue funcionando** — sanity para no romper el caso base.
3. **`submitCommit` tras consumir el parent proof sigue rechazado** — el rechazo es independiente del estado de consumo del padre.
4. **Two-connection concurrent close** — segundo `createDb(connString)` apuntando al mismo embedded postgres con su propio pool, dos `verifyNoCodeReviewAtTransition` paralelas compitiendo por el lock del parent commit proof; el ganador consume el proof, el perdedor lee `consumedAtTransitionId` y devuelve `parent_proof_missing`.

### Tiempo de suite

```
RUN  v4.1.10 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Paperclip/.worktrees/zal-217-atomic/server
 Test Files  1 passed (1)
      Tests  30 passed (30)
   Duration  8.20s
```

## 4. Garantías preservadas

- **ZAL-206 parent A / peer B**: el flujo válido (autor A planta C-1 en parent, peer B crea `review_no_code` child, cierra con verdict comment) sigue funcionando. El rechazo `ReviewNoCodeOwnCommitForbidden` aplica solo a INSERTs sobre la review issue, no sobre la parent.
- **ZAL-179 no-code review**: el cierre sigue siendo sobre evidencia durable del reviewer (comment no soft-deleted, body no vacío, autor == assignee). El nuevo check de status refuerza, no debilita.
- **ZAL-88 SHA gate**: el path estándar sigue exigiendo commit proof + peer verification. `review_no_code` es opt-in vía `workMode` y solo aplica a issues con parent `done`.
- **ZAL-86 immutability**: los proofs siguen siendo append-only por convención; el campo `consumedAtTransitionId` se setea dentro del close y los proofs consumidos son inmutables.

## 5. Riesgos residuales (no resueltos aquí, scope siguiente)

- **`tombstoneComment` durante close in-flight**: el `FOR UPDATE` sobre la evidence row serializa el tombstone detrás del close. Si el tombstone llega primero, el close ve `deletedAt IS NOT NULL` y falla con `reviewer_evidence_missing` ✓. Si el tombstone llega durante el close, queda en cola y se aplica después de que el commit del close libere el lock → soft-delete post-cierre de evidencia ya verificada, no rompe correctness pero deja audit trail "evidencia borrada después de cerrar". Aceptable; documentar.
- **`submitPeerVerification` durante close in-flight**: peer proofs no tocan el parent commit proof, no hay race con el `consumedAtTransitionId` del padre. La supersede ya filtra `consumedAtTransitionId IS NULL`. Sin cambio necesario.
- **`recovery.pause.codeGates` ZAL-90 ON**: sigue bloqueando code issues en `in_review → done` con 409 `RecoveryPausedUntilGitGate` ANTES del SHA gate. `review_no_code` (no-code) bypasea el pause por construcción (`isCodeIssue=false`).

## 6. Próximos pasos sugeridos

1. Issue de seguimiento para `tombstoneComment` que rechace borrar evidencia viva de un `review_no_code` activo (no rompería el caso actual, solo endurece audit).
2. Métrica: contar cuántas veces el rechazo `ReviewNoCodeOwnCommitForbidden` se dispara en prod en 7 días; si > 0, probablemente el form de la UI ofrece "attach commit proof" sin filtrar por workMode.
3. Backport del rechazo `submitCommit` a ZAL-272 (C-2 collision + supersede) — no debería entrar en conflicto porque ese fix es board-only supersede, no agent submit.

## 7. Refs

- ZAL-206 (parent proof author anchor, base contract)
- ZAL-179 (review_no_code work mode definition)
- ZAL-88 (SHA gate, C-1+C-3)
- ZAL-89 (peer verification, PeerNotIndependent)
- ZAL-90 (recovery.pause.codeGates, no aplica aquí)
- ZAL-272 (commit proof supersede, complementario)
- Commit base: `a0b11a85b`
- Worktree: `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Paperclip/.worktrees/zal-217-atomic`
