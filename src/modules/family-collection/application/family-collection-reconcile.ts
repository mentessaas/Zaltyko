/**
 * Cobro automático de cuotas (Fase 3), Fase A del proceso diario: poner al día
 * lo que quedó a medias antes de cobrar nada nuevo.
 *
 * 1. Reanudar los intentos `claimed`/`created` sin cambios desde hace más de
 *    15 minutos, tomándolos de forma atómica de RESUME_BATCH_SIZE en
 *    RESUME_BATCH_SIZE (cada toma suma una reanudación; como mucho tres). Antes
 *    de cada intento se mira el plazo: si se acabó, los tomados que no se
 *    procesaron recuperan su reanudación (releaseResume). Se usa el `pi_…`
 *    guardado o se busca por el id del intento antes de crear: nunca un
 *    segundo cobro, aunque Stripe ya haya olvidado la clave de idempotencia (24 h).
 * 2. Red de seguridad: un intento `claimed`/`created` que ya agotó sus
 *    reanudaciones y no tiene el aviso `resume_exhausted` lo recibe (una sola
 *    vez). Ningún intento queda abierto para siempre sin que la academia lo sepa.
 * 3. Releer en Stripe los intentos `processing` (domiciliación o tarjeta
 *    pendiente) y aplicar su estado final. La Fase 4 lo hará por eventos. Si
 *    Stripe no deja leerlo, se registra el nombre y el código del error
 *    (permanente o pasajero) y se sigue con el resto; si además el intento se
 *    reclamó hace más de 15 días, la academia recibe el aviso
 *    `processing_unreadable` (una sola vez).
 */
import { logger } from "@/lib/logger";
import { mapPaymentIntent, type PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import { stripeReadFailureOf } from "@/modules/family-collection/domain/stripe-read-error";
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
import type {
  CollectionAttempt,
  ResumedAttempt,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  isLongProcessingAttempt,
  type FamilyCollectionAttemptStatus,
} from "@/modules/family-collection/infrastructure/family-collection-schema";

/**
 * Intentos que se toman de una vez para reanudar. Pocos: cada toma gasta una
 * reanudación, y si la ejecución se corta (límite de 300 s de Vercel) no deben
 * quedar muchos tomados sin procesar.
 */
export const RESUME_BATCH_SIZE = 10;

/** Aviso a la academia: un cobro en curso desde hace más de 15 días que Stripe no deja leer. */
export const PROCESSING_UNREADABLE_REASON = "processing_unreadable";

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
  } catch (error) {
    // Solo ids, nombre y código del error: nunca su mensaje.
    const failure = stripeReadFailureOf(error);
    const fields = {
      organizationId: attempt.organizationId,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
      errorName: failure.errorName,
      errorCode: failure.errorCode,
      permanent: failure.permanent,
    };
    if (failure.permanent) {
      // Cobro inexistente, cuenta sin permiso o ya no válida: reintentar no lo arregla.
      logger.error("Cobro automático: Stripe no deja releer un cobro en curso", undefined, fields);
      countSkip(state, "stripe_unreadable");
    } else {
      logger.warn("Cobro automático: no se pudo releer un cobro en curso; se vuelve a mirar otro día", fields);
      countSkip(state, "transient");
    }
    // El intento sigue en curso (su dinero pudo moverse); pasados 15 días la
    // academia lo sabe y puede «Marcar como revisado».
    if (isLongProcessingAttempt(attempt, state.now)) {
      await notifyReview(state, attempt, PROCESSING_UNREADABLE_REASON);
    }
    return null;
  }
  return settleOutcome(state, attempt, refs, mapPaymentIntent(snapshot), snapshot, {
    lastChance: false,
    allowCancel: true,
  });
}

/**
 * Se acabó el tiempo con intentos tomados sin procesar: cada uno recupera su
 * reanudación. Un fallo se registra y no para los demás (el intento solo
 * habrá gastado una reanudación, como antes).
 */
async function releaseResumes(state: RunState, attempts: readonly ResumedAttempt[]): Promise<void> {
  for (const attempt of attempts) {
    try {
      if (await state.store.releaseResume(attempt)) countSkip(state, "resume_released");
    } catch (error) {
      logStepFailure("Cobro automático: no se pudo devolver la reanudación de un intento", error, {
        organizationId: attempt.organizationId,
        invoiceId: attempt.invoiceId,
        attemptId: attempt.id,
      });
      countSkip(state, "error");
    }
  }
}

export async function reconcilePendingAttempts(state: RunState): Promise<void> {
  const staleBefore = new Date(state.now.getTime() - RESUME_STALE_MS);
  const resumeLimit = Math.min(state.batchSize, RESUME_BATCH_SIZE);

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
      limit: resumeLimit,
      now: state.now,
      scope: state.scope,
    });
    for (let index = 0; index < batch.length; index += 1) {
      const attempt = batch[index];
      if (isExpired(state)) {
        // Los que quedan no se procesan: recuperan la reanudación que se les contó.
        await releaseResumes(state, batch.slice(index));
        state.result.complete = false;
        return;
      }
      cursor = attempt.id;
      state.result.resumed += 1;
      await guarded(state, attempt, () => advanceAttempt(state, attempt, { phase: "resume" }));
    }
    if (batch.length < resumeLimit) break;
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
