/**
 * Cobro automático de cuotas (Fase 3), Fase A del proceso diario: poner al día
 * lo que quedó a medias antes de cobrar nada nuevo.
 *
 * 1. Reanudar los intentos `claimed`/`created` de hace más de 15 minutos,
 *    tomándolos de forma atómica (cada toma suma una reanudación; como mucho
 *    tres). Se usa el `pi_…` guardado o se busca por el id del intento antes
 *    de crear: nunca un segundo cobro, aunque Stripe ya haya olvidado la
 *    clave de idempotencia (24 h).
 * 2. Red de seguridad: un intento `claimed`/`created` que ya agotó sus
 *    reanudaciones y no tiene el aviso `resume_exhausted` lo recibe (una sola
 *    vez). Ningún intento queda abierto para siempre sin que la academia lo sepa.
 * 3. Releer en Stripe los intentos `processing` (domiciliación o tarjeta
 *    pendiente) y aplicar su estado final. La Fase 4 lo hará por eventos.
 */
import { mapPaymentIntent, type PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import {
  advanceAttempt,
  countSkip,
  isExpired,
  logStepFailure,
  notifyReview,
  notifyStepError,
  RESUME_STALE_MS,
  settleOutcome,
  type RunState,
} from "@/modules/family-collection/application/family-collection-steps";
import type { CollectionAttempt } from "@/modules/family-collection/infrastructure/family-collection-store";
import type { FamilyCollectionAttemptStatus } from "@/modules/family-collection/infrastructure/family-collection-schema";

async function guarded(
  state: RunState,
  attempt: CollectionAttempt,
  step: () => Promise<FamilyCollectionAttemptStatus | null>
): Promise<void> {
  try {
    const status = await step();
    if (status !== null) state.result.reconciled += 1;
  } catch (error) {
    // Una caída deja el intento como estaba; se vuelve a mirar otro día.
    logStepFailure("Cobro automático: falló la puesta al día de un intento", error, {
      organizationId: attempt.organizationId,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
    });
    countSkip(state, "error");
    await notifyStepError(state, attempt, error).catch(() => undefined);
  }
}

/** Relee en Stripe un intento `processing` y aplica su estado si ya terminó. */
async function rereadProcessing(
  state: RunState,
  attempt: CollectionAttempt
): Promise<FamilyCollectionAttemptStatus | null> {
  const refs = await state.store.loadAttemptRefs(attempt);
  if (!refs || !attempt.paymentIntentId) {
    await notifyReview(state, attempt, "attempt_unreadable");
    return null;
  }
  let snapshot: PaymentIntentSnapshot;
  try {
    snapshot = await state.gateway.retrievePayment({
      connectedAccount: refs.connectedAccount,
      paymentIntentId: attempt.paymentIntentId,
    });
  } catch {
    countSkip(state, "transient");
    return null;
  }
  return settleOutcome(state, attempt, refs, mapPaymentIntent(snapshot), snapshot, {
    lastChance: false,
    allowCancel: true,
  });
}

export async function reconcilePendingAttempts(state: RunState): Promise<void> {
  const staleBefore = new Date(state.now.getTime() - RESUME_STALE_MS);

  // 1. Reanudar.
  let cursor: string | null = null;
  for (;;) {
    if (isExpired(state)) {
      state.result.complete = false;
      return;
    }
    const batch = await state.store.claimResumable({
      staleBefore,
      after: cursor,
      limit: state.batchSize,
      now: state.now,
      scope: state.scope,
    });
    // Los intentos tomados se procesan todos: su reanudación ya se contó.
    for (const attempt of batch) {
      cursor = attempt.id;
      state.result.resumed += 1;
      await guarded(state, attempt, () => advanceAttempt(state, attempt, { phase: "resume" }));
    }
    if (batch.length < state.batchSize) break;
  }

  // 2. Red de seguridad de los que agotaron sus reanudaciones.
  cursor = null;
  for (;;) {
    if (isExpired(state)) {
      state.result.complete = false;
      return;
    }
    const batch = await state.store.listExhaustedWithoutNotice({
      after: cursor,
      limit: state.batchSize,
      scope: state.scope,
    });
    for (const attempt of batch) {
      cursor = attempt.id;
      try {
        await notifyReview(state, attempt, "resume_exhausted");
      } catch (error) {
        logStepFailure("Cobro automático: no se pudo avisar de un intento agotado", error, {
          organizationId: attempt.organizationId,
          invoiceId: attempt.invoiceId,
          attemptId: attempt.id,
        });
        countSkip(state, "error");
      }
    }
    if (batch.length < state.batchSize) break;
  }

  // 3. Releer los que están en curso.
  cursor = null;
  for (;;) {
    if (isExpired(state)) {
      state.result.complete = false;
      return;
    }
    const batch = await state.store.listProcessing({ after: cursor, limit: state.batchSize, scope: state.scope });
    for (const attempt of batch) {
      if (isExpired(state)) {
        state.result.complete = false;
        return;
      }
      cursor = attempt.id;
      await guarded(state, attempt, () => rereadProcessing(state, attempt));
    }
    if (batch.length < state.batchSize) break;
  }
}
