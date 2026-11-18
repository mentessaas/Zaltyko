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
 *    pendiente) y aplicar su estado final (reconcileAttemptWithStripe, la
 *    misma función que usan los eventos de Stripe de la Fase 4). Si
 *    Stripe no deja leerlo, se registra el nombre y el código del error
 *    (permanente o pasajero) y se sigue con el resto; si además el intento se
 *    reclamó hace más de 15 días, la academia recibe el aviso
 *    `processing_unreadable` (una sola vez). Un error permanente va como
 *    error al registro hasta que existe ese aviso; después, como advertencia.
 *    Un `requires_action` ilegible con el plazo de la familia ya pasado, o
 *    que Stripe no deja cancelar de forma permanente al caducar, recibe el
 *    aviso `requires_action_unreadable` (Tarea M, puntos 4 y 5).
 *    Fase 4: también los `requires_action` (la familia tiene que confirmar el
 *    pago con su banco). Antes de su plazo, si Stripe sigue sin cobrarlo,
 *    nada cambia; pasado el plazo se cancela en Stripe y se cierra `failed`
 *    `authentication_required` (si Stripe ya lo cobró, se registra). Sin
 *    reintento ni segundo correo: vuelven los recordatorios.
 * 4. Fase 4: cobros tardíos en espera (aviso `late_success_pending`): un
 *    intento cerrado cuyo cobro Stripe completó tarde mientras la factura
 *    tenía otro cobro que no se dejaba cancelar (una domiciliación en el
 *    banco). Se vuelve a pasar por settleClosedAttempt hasta que el tardío
 *    queda registrado o con el aviso `duplicate_collection`. Va después del
 *    paso 3, que ya habrá cerrado la domiciliación si el banco la resolvió.
 * 5. Fase 4 (Tarea M, punto 6): devoluciones que no cabían en lo repartido
 *    (aviso `refund_unallocated` de los últimos REFUND_UNALLOCATED_REREAD_MS).
 *    Si la academia repartió después el pago, se releen en Stripe (fuera de
 *    transacción) y se anotan por el mismo camino (recordAttemptRefunds). El
 *    intento deja de releerse en cuanto todas sus devoluciones quedan
 *    anotadas o pasa ese plazo. Solo con la bandera de eventos (como las
 *    devoluciones por evento).
 */
import { logger } from "@/lib/logger";
import { mapPaymentIntent, type PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import { isAuthenticationDeadlinePassed } from "@/modules/family-collection/domain/authentication-window";
import { stripeReadFailureOf } from "@/modules/family-collection/domain/stripe-read-error";
import {
  advanceAttempt,
  cancelThenClose,
  countSkip,
  isExpired,
  logStepFailure,
  notifyReview,
  notifyStepError,
  REQUIRES_ACTION_UNREADABLE_REASON,
  RESUME_STALE_MS,
  settleLateSuccess,
  settleOutcome,
  type RunState,
} from "@/modules/family-collection/application/family-collection-steps";
import {
  LATE_SUCCESS_ELSEWHERE_CODE,
  LATE_SUCCESS_PENDING_REASON,
  LATE_SUCCESS_SIBLING_IN_FLIGHT,
} from "@/modules/family-collection/domain/late-success";
import type {
  CollectionAttempt,
  ResumedAttempt,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  FAMILY_COLLECTION_OPEN_STATUSES,
  isLongProcessingAttempt,
  type FamilyCollectionAttemptStatus,
} from "@/modules/family-collection/infrastructure/family-collection-schema";

/**
 * Intentos que se toman de una vez para reanudar. Pocos: cada toma gasta una
 * reanudación, y si la ejecución se corta (límite de 300 s de Vercel) no deben
 * quedar muchos tomados sin procesar.
 */
export const RESUME_BATCH_SIZE = 10;

/**
 * Tarea M, punto 6: cuánto tiempo, desde el aviso `refund_unallocated`, se
 * vuelve a mirar cada día si la devolución ya cabe (30 días, lo mismo que
 * Stripe deja reenviar eventos). Después, la academia ya tiene el aviso.
 */
export const REFUND_UNALLOCATED_REREAD_MS = 30 * 24 * 60 * 60 * 1000;

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

/**
 * Relee en Stripe el cobro de un intento abierto con `pi_…` y aplica su
 * estado con `settleOutcome` (`{ lastChance: false, allowCancel: true }`): el
 * mismo camino para la relectura diaria y para los eventos de Stripe (Fase 4),
 * donde el evento solo es el aviso de que hay que releer. `transient` o
 * `requires_confirmation` no escriben nada.
 *
 * Sin `pi_…` o sin con qué leerlo: aviso `attempt_unreadable` a la academia.
 * Si Stripe no deja leerlo, por defecto el error sigue hacia quien llama (el
 * evento queda `failed` y Stripe lo reenvía); la relectura diaria pasa
 * `onReadError` para registrarlo y seguir con los demás.
 */
export async function reconcileAttemptWithStripe(
  state: RunState,
  attempt: CollectionAttempt,
  options: { onReadError?: (error: unknown) => Promise<null> } = {}
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
    if (options.onReadError) return options.onReadError(error);
    throw error;
  }
  return settleOutcome(state, attempt, refs, mapPaymentIntent(snapshot), snapshot, {
    lastChance: false,
    allowCancel: true,
  });
}

/** Relee en Stripe un intento `processing` (o `requires_action`) y aplica su estado si ya terminó. */
function rereadProcessing(state: RunState, attempt: CollectionAttempt): Promise<FamilyCollectionAttemptStatus | null> {
  return reconcileAttemptWithStripe(state, attempt, {
    onReadError: (error) => processingReadFailed(state, attempt, error),
  });
}

/**
 * ¿Qué aviso recibe la academia cuando Stripe no deja releer este intento?
 * - `processing` reclamado hace más de 15 días: `processing_unreadable`;
 * - Fase 4 (Tarea M, punto 4), `requires_action` con su plazo para confirmar
 *   el pago ya pasado: `requires_action_unreadable` (antes del plazo la
 *   familia aún puede confirmarlo y no hay nada que revisar);
 * - si no, ninguno todavía.
 */
async function unreadableNoticeReason(state: RunState, attempt: CollectionAttempt): Promise<string | null> {
  if (isLongProcessingAttempt(attempt, state.now)) return PROCESSING_UNREADABLE_REASON;
  if (attempt.status !== "requires_action") return null;
  const deadline = await state.store.readActionDeadline({
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
  });
  // Sin plazo es que otro camino ya lo sacó de `requires_action`.
  if (deadline === null || !isAuthenticationDeadlinePassed(deadline, state.now)) return null;
  return REQUIRES_ACTION_UNREADABLE_REASON;
}

/**
 * Stripe no dejó releer un intento `processing` (o `requires_action`): se
 * registra (solo ids, nombre y código) y, con más de 15 días en curso (o, en
 * `requires_action`, con el plazo de la familia ya pasado), la academia
 * recibe el aviso (`unreadableNoticeReason`). El intento sigue abierto.
 */
async function processingReadFailed(state: RunState, attempt: CollectionAttempt, error: unknown): Promise<null> {
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
  // El intento sigue en curso (su dinero pudo moverse); pasados 15 días la
  // academia lo sabe y puede «Marcar como revisado» (con un error permanente
  // lo cierra como `reviewed_unverifiable`: lo comprueba en su panel de
  // Stripe y, si se cobró, lo registra como pago manual). El aviso va antes del
  // registro para saber si ya existía; si falla, se registra igual el error
  // de Stripe y después el del aviso.
  let noticeAlreadyRecorded = false;
  let noticeFailure: { error: unknown } | null = null;
  try {
    const reason = await unreadableNoticeReason(state, attempt);
    if (reason !== null) noticeAlreadyRecorded = !(await notifyReview(state, attempt, reason));
  } catch (noticeError) {
    noticeFailure = { error: noticeError };
  }
  if (failure.permanent) {
    // Cobro inexistente, cuenta sin permiso o ya no válida: reintentar no lo
    // arregla. Con el aviso ya registrado en otra ejecución, la academia ya
    // lo sabe: queda como advertencia y no como error en cada ejecución diaria.
    if (noticeAlreadyRecorded) {
      logger.warn(
        "Cobro automático: Stripe sigue sin dejar releer un cobro en curso; la academia ya tiene el aviso",
        fields
      );
    } else {
      logger.error("Cobro automático: Stripe no deja releer un cobro en curso", undefined, fields);
    }
    countSkip(state, "stripe_unreadable");
  } else {
    logger.warn("Cobro automático: no se pudo releer un cobro en curso; se vuelve a mirar otro día", fields);
    countSkip(state, "transient");
  }
  if (noticeFailure) throw noticeFailure.error;
  return null;
}

/**
 * Fase 4 (Tarea 7): después de registrar tarde el cobro de un intento (el
 * tardío o el hermano que Stripe ya había cobrado), se anotan las
 * devoluciones que Stripe ya hizo de ese cobro (applyRecordedAttemptRefunds,
 * el mismo camino que los eventos de devolución): mientras el intento estaba
 * cerrado en el libro no tuvieron efecto y su evento no se repite. El cobro ya
 * quedó registrado: un error aquí no lo deshace ni hace fallar el evento; se
 * registra (solo ids, nombre y código) para que soporte lo revise.
 */
async function applyRecordedRefunds(state: RunState, attempt: CollectionAttempt, connectedAccount: string): Promise<void> {
  if (!state.applyRecordedRefunds) return;
  try {
    await state.applyRecordedRefunds(attempt, connectedAccount);
  } catch (error) {
    const failure = stripeReadFailureOf(error);
    logger.error("Cobro automático: no se pudieron anotar las devoluciones de un cobro registrado tarde", undefined, {
      organizationId: attempt.organizationId,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
      errorName: failure.errorName,
      errorCode: failure.errorCode,
    });
    countSkip(state, "late_refunds_unread");
  }
}

/** Estados de un hermano que todavía puede cobrar (impiden registrar el tardío). */
const OPEN_SIBLING_STATUSES: ReadonlySet<string> = new Set(FAMILY_COLLECTION_OPEN_STATUSES);

/** Estados de un hermano abierto que ya tiene su propio cobro en Stripe (se puede intentar cancelar). */
const OPEN_WITH_INTENT_STATUSES: ReadonlySet<string> = new Set(["created", "processing", "requires_action"]);

/** Resultado de settleClosedAttempt cuando el tardío queda en espera (con su aviso). */
export type ClosedAttemptOutcome = FamilyCollectionAttemptStatus | typeof LATE_SUCCESS_PENDING_REASON | null;

/**
 * Fase 4, cobro tardío: el cobro de un intento cerrado (`failed`/`canceled`).
 * Lo usan el evento de Stripe (`source: "event"`) y la relectura diaria de
 * los que quedaron en espera (`source: "daily"`). Nunca dos cobros:
 *
 * 1. Se relee el cobro; si Stripe no lo da por cobrado, nada.
 * 2. Si la factura ya tiene otro intento cobrado, no se cancela nada: el
 *    almacén deja el aviso `duplicate_collection` sin registrar el tardío.
 * 3. Un hermano `claimed` (el proceso diario lo está creando ahora mismo)
 *    → desde el evento, LATE_SUCCESS_SIBLING_IN_FLIGHT (Stripe reenvía en
 *    segundos o minutos); desde la relectura diaria, se mira otro día.
 * 4. Cada hermano abierto con su `pi_…` se cancela en Stripe, fuera de toda
 *    transacción (`cancelThenClose`, `late_success_elsewhere`). Si Stripe ya
 *    lo cobró, se registra ese y el tardío pasa a 2.
 * 5. Si después sigue abierto alguno (Stripe no deja cancelar una
 *    domiciliación en el banco, o no se pueden leer sus referencias), el
 *    tardío queda en espera con el aviso `late_success_pending` (la marca que
 *    relee el paso 4 diario) y se devuelve LATE_SUCCESS_PENDING_REASON.
 * 6. Si no, se registra (settleLateSuccess); el almacén repite 2 y 3 con la
 *    factura bloqueada.
 * 7. Fase 4 (Tarea 7): registrado el tardío (o, en 4, el hermano que Stripe
 *    ya había cobrado), se anotan las devoluciones que Stripe ya hizo de ese
 *    cobro (applyRecordedRefunds).
 *
 * Errores de Stripe: desde el evento, uno pasajero sigue hacia arriba con su
 * propio código (el evento queda `failed` y Stripe lo reenvía); desde la
 * relectura diaria, se cuenta y se mira otro día. Uno permanente al releer el
 * tardío no tiene efecto en ninguno de los dos.
 */
export async function settleClosedAttempt(
  state: RunState,
  attempt: CollectionAttempt,
  options: { source: "event" | "daily" }
): Promise<ClosedAttemptOutcome> {
  const fromEvent = options.source === "event";
  const ids = { organizationId: attempt.organizationId, invoiceId: attempt.invoiceId, attemptId: attempt.id };
  const siblingInFlight = (siblingAttemptId: string): null => {
    logger.warn("Cobro automático: cobro tardío con otro intento de la misma cuota en marcha; se espera", {
      ...ids,
      siblingAttemptId,
    });
    if (fromEvent) throw new Error(LATE_SUCCESS_SIBLING_IN_FLIGHT);
    countSkip(state, "late_success_sibling_in_flight");
    return null;
  };

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
    if (fromEvent && !failure.permanent) throw error;
    logger.warn("Cobro automático: Stripe no deja leer el cobro de un intento cerrado", {
      ...ids,
      errorName: failure.errorName,
      errorCode: failure.errorCode,
      permanent: failure.permanent,
    });
    countSkip(state, failure.permanent ? "stripe_unreadable" : "transient");
    return null;
  }
  // 1. Fallido o cancelado de verdad: el intento ya está bien cerrado.
  if (mapPaymentIntent(snapshot) !== "succeeded") return null;

  const listSiblings = () =>
    state.store.listInvoiceSiblings({
      organizationId: attempt.organizationId,
      invoiceId: attempt.invoiceId,
      excludeAttemptId: attempt.id,
    });
  let siblings = await listSiblings();
  // 2. Con otro intento ya cobrado no se cancela nada.
  if (!siblings.some((sibling) => sibling.status === "succeeded")) {
    // 3. Un hermano a medio crear: sin su `pi_…` no se puede cancelar.
    const claimed = siblings.find((sibling) => sibling.status === "claimed");
    if (claimed) return siblingInFlight(claimed.id);
    // 4. Cada hermano con su propio cobro: cancelar en Stripe y cerrar.
    for (const sibling of siblings) {
      if (!OPEN_WITH_INTENT_STATUSES.has(sibling.status) || !sibling.paymentIntentId) continue;
      const siblingRefs = await state.store.loadAttemptRefs(sibling);
      // Sin con qué leerlo no se puede cancelar: queda abierto (paso 5).
      if (!siblingRefs) continue;
      const siblingStatus = await cancelThenClose(
        state,
        sibling,
        siblingRefs,
        { kind: "canceled", reason: LATE_SUCCESS_ELSEWHERE_CODE },
        { stripeErrors: fromEvent ? "throw" : "skip" }
      );
      // Stripe ya lo había cobrado y se acaba de registrar: sus devoluciones también.
      if (siblingStatus === "succeeded") await applyRecordedRefunds(state, sibling, siblingRefs.connectedAccount);
    }
    // 5. ¿Queda alguno abierto? Entonces el tardío espera, con su aviso.
    siblings = await listSiblings();
    if (!siblings.some((sibling) => sibling.status === "succeeded")) {
      const stillOpen = siblings.filter((sibling) => OPEN_SIBLING_STATUSES.has(sibling.status));
      const claimedNow = stillOpen.find((sibling) => sibling.status === "claimed");
      if (claimedNow) return siblingInFlight(claimedNow.id);
      if (stillOpen.length > 0) {
        await notifyReview(state, attempt, LATE_SUCCESS_PENDING_REASON);
        logger.info("Cobro automático: cobro tardío en espera de que se resuelva otro cobro de la misma cuota", {
          ...ids,
          siblingAttemptIds: stillOpen.map((sibling) => sibling.id),
        });
        countSkip(state, LATE_SUCCESS_PENDING_REASON);
        return LATE_SUCCESS_PENDING_REASON;
      }
    }
  }
  // 6. Registro del tardío (o aviso duplicate_collection), con todo bloqueado.
  try {
    const recorded = await settleLateSuccess(state, attempt, snapshot);
    // 7. Las devoluciones que la academia hizo mientras esperaba (Tarea 7).
    if (recorded === "succeeded") await applyRecordedRefunds(state, attempt, refs.connectedAccount);
    return recorded;
  } catch (error) {
    // Un hermano se abrió entre la lectura y la transacción: otro día.
    if (!fromEvent && error instanceof Error && error.message === LATE_SUCCESS_SIBLING_IN_FLIGHT) {
      countSkip(state, "late_success_sibling_in_flight");
      return null;
    }
    throw error;
  }
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

  // 3. Releer los que están en curso (y, Fase 4, los que esperan a la familia).
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

  // 4. Cobros tardíos en espera (aviso late_success_pending), después de
  // releer las domiciliaciones del paso 3.
  cursor = null;
  for (;;) {
    if (isExpired(state)) {
      state.result.complete = false;
      return;
    }
    const batch = await state.store.listLateSuccessPending({
      after: cursor,
      limit: state.batchSize,
      scope: state.scope,
    });
    for (const attempt of batch) {
      if (isExpired(state)) {
        state.result.complete = false;
        return;
      }
      cursor = attempt.id;
      await guarded(state, attempt, async () => {
        const outcome = await settleClosedAttempt(state, attempt, { source: "daily" });
        // Sigue en espera: no cambió nada que contar como puesto al día.
        return outcome === LATE_SUCCESS_PENDING_REASON ? null : outcome;
      });
    }
    if (batch.length < state.batchSize) break;
  }

  // 5. Devoluciones que no cabían en lo repartido (aviso refund_unallocated).
  await rereadUnallocatedRefunds(state);
}

/**
 * Paso 5 de la Fase A (Tarea M, punto 6). Sin `applyRecordedRefunds` (bandera
 * de eventos apagada o Stripe simulado sin devoluciones) no hace nada.
 * Cada intento relee en Stripe el cargo de su `pi_…` con todas sus
 * devoluciones (applyRecordedAttemptRefunds): las que ahora caben se anotan;
 * las que siguen sin caber no repiten aviso (uno por `re_…`). Un error se
 * registra (solo ids, nombre y código) y se sigue con el resto.
 */
async function rereadUnallocatedRefunds(state: RunState): Promise<void> {
  const apply = state.applyRecordedRefunds;
  if (!apply) return;
  const since = new Date(state.now.getTime() - REFUND_UNALLOCATED_REREAD_MS);
  let cursor: string | null = null;
  for (;;) {
    if (isExpired(state)) {
      state.result.complete = false;
      return;
    }
    const batch = await state.store.listUnallocatedRefundAttempts({
      after: cursor,
      limit: state.batchSize,
      scope: state.scope,
      since,
    });
    for (const attempt of batch) {
      if (isExpired(state)) {
        state.result.complete = false;
        return;
      }
      cursor = attempt.id;
      try {
        const refs = await state.store.loadAttemptRefs(attempt);
        // Sin cuenta con la que leer: la academia ya tiene el aviso.
        if (!refs) continue;
        await apply(attempt, refs.connectedAccount);
      } catch (error) {
        const failure = stripeReadFailureOf(error);
        logger.warn("Cobro automático: no se pudieron releer las devoluciones sin repartir de un cobro", {
          organizationId: attempt.organizationId,
          invoiceId: attempt.invoiceId,
          attemptId: attempt.id,
          errorName: failure.errorName,
          errorCode: failure.errorCode,
        });
        countSkip(state, "refund_unallocated_unread");
      }
    }
    if (batch.length < state.batchSize) break;
  }
}
