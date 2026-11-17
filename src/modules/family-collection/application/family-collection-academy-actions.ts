/**
 * Cobro automático de cuotas (Fase 3): lo que la academia puede hacer con el
 * cobro automático de una factura.
 *
 * - «Cancelar el cobro automático» (`cancelAutomaticCollection`):
 *   - fallido con reintento pendiente → `canceled` (`canceled_by_academy`);
 *   - creado en Stripe y sin confirmar → primero se cancela en Stripe (fuera
 *     de toda transacción) y, solo si Stripe lo confirma, se cierra;
 *   - en curso en el banco (`processing`) → 409: la domiciliación ya salió;
 *   - reclamado (el proceso diario lo está cobrando ahora) → 409.
 * - «Marcar como revisado» (`markAutomaticCollectionReviewed`): solo para un
 *   intento que quedó abierto con un aviso de revisión o que agotó sus
 *   reanudaciones, y solo si la persona confirma que lo comprobó en Stripe.
 *   Lo cierra como `canceled` (`reviewed_by_academy`), con auditoría.
 *
 * Nunca se cierra un intento cuyo dinero pudo moverse sin registrarlo: antes
 * de cerrarlo se relee el cobro y, si salió, se registra por el mismo camino
 * que usa el proceso diario (`applyOutcome`: pago, reparto y aviso si no
 * cuadra). Si hay varios cobros y alguno salió o está en curso, o el intento
 * tiene un cobro guardado que no se puede leer, no se cierra: la academia lo
 * resuelve en Stripe con su soporte.
 *
 * Propiedad, o administración con todas las sedes. No exige la bandera de
 * esta fase (con la función apagada la academia tiene que poder cerrar lo que
 * quedó abierto), pero sí los cerrojos de R11 (clave de test y base que no es
 * la de producción) y las tablas de las Fases 1, 2 y 3.
 */
import { z } from "zod";

import { AUTOMATIC_COLLECTION_IN_PROGRESS_MESSAGE } from "@/modules/billing/application/ledger-service";
import {
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import type { PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import {
  closeAttemptByAcademy,
  createFamilyCollectionStore,
  readLatestAttemptForAcademy,
  type AcademyAttemptView,
  type AcademyCloseReason,
  type FamilyCollectionStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import { FAMILY_COLLECTION_MAX_RESUMES } from "@/modules/family-collection/infrastructure/family-collection-schema";
import {
  createStripeCollectionGateway,
  listCollectionPaymentsByAttempt,
  type FamilyCollectionGateway,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/** Lo que devuelve una acción: cerrado, revisado, o el cobro ya se hizo y quedó registrado. */
export type AcademyCollectionOutcome = "canceled" | "reviewed" | "collected";

/** Lo que las acciones necesitan de la base (inyectable en los tests). */
export interface AcademyCollectionStore {
  isStorageAvailable: FamilyCollectionStore["isStorageAvailable"];
  loadAttemptRefs: FamilyCollectionStore["loadAttemptRefs"];
  applyOutcome: FamilyCollectionStore["applyOutcome"];
  readLatestAttempt: typeof readLatestAttemptForAcademy;
  closeAttempt: typeof closeAttemptByAcademy;
}

/** Stripe para las acciones: el adaptador del proceso diario y la lista de cobros de un intento. */
export interface AcademyCollectionGateway extends FamilyCollectionGateway {
  listPaymentsByAttempt(input: { connectedAccount: string; attemptId: string }): Promise<PaymentIntentSnapshot[]>;
}

export interface AcademyCollectionDeps {
  store?: AcademyCollectionStore;
  gateway?: AcademyCollectionGateway;
}

const inputSchema = z.object({
  userId: z.guid(),
  organizationId: z.guid(),
  invoiceId: z.guid(),
});

const OPEN_STATUSES: ReadonlySet<string> = new Set(["claimed", "created", "processing"]);

const TEXT = {
  unavailable: "El cobro automático de cuotas no está disponible todavía.",
  forbidden: "Solo la propiedad o la administración de todas las sedes puede gestionar los cobros automáticos.",
  nothingToCancel: "Esta cuota no tiene ningún cobro automático pendiente que cancelar.",
  nothingToReview: "Esta cuota no tiene ningún cobro automático pendiente de revisar.",
  processing: "Este cobro ya se envió al banco y no se puede cancelar. Espera al resultado.",
  reviewNotNeeded: "Este cobro sigue su curso y no necesita revisión. Espera al resultado.",
  confirmationRequired: "Confirma que has comprobado el cobro en Stripe antes de marcarlo como revisado.",
  unverified: "No se pudo comprobar el estado del cobro. Vuelve a intentarlo en un momento.",
  changed:
    "El cobro automático de esta cuota cambió o acaba de empezar. Recarga la página y vuelve a intentarlo.",
  recordedElsewhere:
    "Este cobro ya figura registrado con otro cobro automático. Revísalo y usa «Marcar como revisado».",
  multipleMoved:
    "Hay varios cobros en Stripe para esta cuota y al menos uno se ha cobrado o está en curso. Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.",
  unreadable:
    "No se puede comprobar en Stripe el cobro de esta cuota. Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.",
} as const;

function defaultGateway(): AcademyCollectionGateway {
  return {
    ...createStripeCollectionGateway(),
    listPaymentsByAttempt: (input) => listCollectionPaymentsByAttempt(input),
  };
}

function defaultStore(): AcademyCollectionStore {
  const store = createFamilyCollectionStore();
  return {
    isStorageAvailable: () => store.isStorageAvailable(),
    loadAttemptRefs: (attempt) => store.loadAttemptRefs(attempt),
    applyOutcome: (input) => store.applyOutcome(input),
    readLatestAttempt: readLatestAttemptForAcademy,
    closeAttempt: closeAttemptByAcademy,
  };
}

interface Context {
  input: z.infer<typeof inputSchema>;
  memberId: string;
  store: AcademyCollectionStore;
  gateway: AcademyCollectionGateway;
  now: Date;
}

/** Cerrojos de R11 → rol → tablas. Con los cerrojos cerrados no se consulta nada. */
async function prepare(
  raw: { userId: string; organizationId: string; invoiceId: string; now?: Date },
  deps: AcademyCollectionDeps
): Promise<Context> {
  const input = inputSchema.parse({
    userId: raw.userId,
    organizationId: raw.organizationId,
    invoiceId: raw.invoiceId,
  });
  if (resolveConnectEnvironment() !== "test" || isProductionDatabase()) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", TEXT.unavailable, 503);
  }
  const scope = await resolveOwnerScope({ userId: input.userId, organizationId: input.organizationId });
  const allowed =
    scope.member.role === "owner" ||
    (scope.member.role === "admin" && scope.member.locationScopeMode === "all");
  if (!allowed) throw new OperationalError("FORBIDDEN", TEXT.forbidden, 403);

  const store = deps.store ?? defaultStore();
  if (!(await store.isStorageAvailable())) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", TEXT.unavailable, 503);
  }
  return {
    input: { ...input, organizationId: scope.organization.id },
    memberId: scope.member.id,
    store,
    gateway: deps.gateway ?? defaultGateway(),
    now: raw.now ?? new Date(),
  };
}

function changed(): OperationalError {
  return new OperationalError("CONCURRENCY_RETRY", TEXT.changed, 409);
}

function unverified(): OperationalError {
  return new OperationalError("AUTOMATIC_COLLECTION_UNVERIFIED", TEXT.unverified, 503);
}

async function close(
  context: Context,
  attempt: AcademyAttemptView,
  reason: AcademyCloseReason,
  expected: { retryPending?: boolean } = {}
): Promise<void> {
  const closed = await context.store.closeAttempt({
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
    expected: { status: attempt.status, paymentIntentId: attempt.paymentIntentId, ...expected },
    reason,
    actor: { userId: context.input.userId, memberId: context.memberId },
    now: context.now,
  });
  if (!closed) throw changed();
}

type StripeState = "stopped" | "succeeded" | "processing" | "unknown";

/**
 * Deja el cobro sin posibilidad de completarse: lo lee y, si no terminó, lo
 * cancela. Si Stripe ya no deja cancelarlo, lo relee una vez y dice lo que vio.
 * `stopped`: cancelado (ya estaba o se acaba de cancelar).
 */
async function stopInStripe(
  gateway: FamilyCollectionGateway,
  connectedAccount: string,
  paymentIntentId: string
): Promise<StripeState> {
  const read = async (): Promise<PaymentIntentSnapshot | null> => {
    try {
      return await gateway.retrievePayment({ connectedAccount, paymentIntentId });
    } catch {
      return null;
    }
  };
  const settled = (snapshot: PaymentIntentSnapshot): StripeState | null =>
    snapshot.status === "succeeded"
      ? "succeeded"
      : snapshot.status === "processing"
        ? "processing"
        : snapshot.status === "canceled"
          ? "stopped"
          : null;

  const first = await read();
  if (!first) return "unknown";
  const known = settled(first);
  if (known) return known;
  let canceled: "canceled" | "not_cancelable";
  try {
    canceled = await gateway.cancelPayment({ connectedAccount, paymentIntentId });
  } catch {
    return "unknown";
  }
  if (canceled === "canceled") return "stopped";
  const second = await read();
  return second ? (settled(second) ?? "unknown") : "unknown";
}

/**
 * El cobro ya salió en Stripe: se registra por el camino del proceso diario
 * (pago, reparto y aviso si no cuadra). `true` si quedó registrado ahora;
 * `false` si ya estaba registrado para otro intento (revisión).
 */
async function recordCollected(
  context: Context,
  attempt: AcademyAttemptView,
  paymentIntentId: string
): Promise<boolean> {
  const result = await context.store.applyOutcome({
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
    outcome: { kind: "succeeded", paymentIntentId },
    environment: "test",
    now: context.now,
  });
  if (result.applied) return true;
  if (result.review === "payment_recorded_for_other_attempt") return false;
  throw changed();
}

/**
 * Varios cobros para un mismo intento: se relee cada uno. Si alguno salió o
 * está en curso, no se cierra nada (409: la academia lo resuelve en Stripe
 * con su soporte; aquí no se elige cuál registrar). Si ninguno movió dinero,
 * se cancelan los que sigan abiertos para que no puedan completarse.
 */
async function stopAllOrRefuse(
  context: Context,
  connectedAccount: string,
  paymentIntentIds: readonly string[]
): Promise<void> {
  const snapshots: PaymentIntentSnapshot[] = [];
  for (const paymentIntentId of paymentIntentIds) {
    try {
      snapshots.push(await context.gateway.retrievePayment({ connectedAccount, paymentIntentId }));
    } catch {
      throw unverified();
    }
  }
  const moved = (status: string) => status === "succeeded" || status === "processing";
  if (snapshots.some((snapshot) => moved(snapshot.status))) {
    throw new OperationalError("AUTOMATIC_COLLECTION_NEEDS_SUPPORT", TEXT.multipleMoved, 409);
  }
  for (const snapshot of snapshots) {
    if (snapshot.status === "canceled") continue;
    const state = await stopInStripe(context.gateway, connectedAccount, snapshot.id);
    if (state === "succeeded" || state === "processing") {
      throw new OperationalError("AUTOMATIC_COLLECTION_NEEDS_SUPPORT", TEXT.multipleMoved, 409);
    }
    if (state === "unknown") throw unverified();
  }
}

/** Cancela el cobro automático pendiente de una factura. */
export async function cancelAutomaticCollection(
  raw: { userId: string; organizationId: string; invoiceId: string; now?: Date },
  deps: AcademyCollectionDeps = {}
): Promise<{ outcome: AcademyCollectionOutcome }> {
  const context = await prepare(raw, deps);
  const attempt = await context.store.readLatestAttempt({
    organizationId: context.input.organizationId,
    invoiceId: context.input.invoiceId,
  });
  if (!attempt) throw new OperationalError("AUTOMATIC_COLLECTION_NOTHING_PENDING", TEXT.nothingToCancel, 409);

  switch (attempt.status) {
    case "failed":
      if (attempt.nextRetryAt === null) {
        throw new OperationalError("AUTOMATIC_COLLECTION_NOTHING_PENDING", TEXT.nothingToCancel, 409);
      }
      // El cobro del intento ya se canceló en Stripe al programar el reintento.
      await close(context, attempt, "canceled_by_academy", { retryPending: true });
      return { outcome: "canceled" };
    case "processing":
      throw new OperationalError("AUTOMATIC_COLLECTION_PROCESSING", TEXT.processing, 409);
    case "claimed":
      // El proceso diario lo está cobrando ahora mismo.
      throw new OperationalError("AUTOMATIC_COLLECTION_IN_PROGRESS", AUTOMATIC_COLLECTION_IN_PROGRESS_MESSAGE, 409);
    case "created": {
      const paymentIntentId = attempt.paymentIntentId;
      const refs = await context.store.loadAttemptRefs(attempt);
      if (!refs || !paymentIntentId) throw unverified();
      const state = await stopInStripe(context.gateway, refs.connectedAccount, paymentIntentId);
      if (state === "succeeded") {
        if (await recordCollected(context, attempt, paymentIntentId)) return { outcome: "collected" };
        // El mismo cobro ya estaba registrado para otro intento: applyOutcome
        // dejó el aviso de revisión, así que «Marcar como revisado» está
        // permitido y es el camino (recargar no lo resolvería).
        throw new OperationalError("AUTOMATIC_COLLECTION_REVIEW_REQUIRED", TEXT.recordedElsewhere, 409);
      }
      if (state === "processing") {
        throw new OperationalError("AUTOMATIC_COLLECTION_PROCESSING", TEXT.processing, 409);
      }
      if (state === "unknown") throw unverified();
      await close(context, attempt, "canceled_by_academy");
      return { outcome: "canceled" };
    }
    default:
      throw new OperationalError("AUTOMATIC_COLLECTION_NOTHING_PENDING", TEXT.nothingToCancel, 409);
  }
}

/**
 * Cierra como revisado un intento que quedó abierto con un aviso de revisión
 * o que agotó sus reanudaciones. Exige `checkedInStripe: true`.
 */
export async function markAutomaticCollectionReviewed(
  raw: { userId: string; organizationId: string; invoiceId: string; checkedInStripe: boolean; now?: Date },
  deps: AcademyCollectionDeps = {}
): Promise<{ outcome: AcademyCollectionOutcome }> {
  if (raw.checkedInStripe !== true) {
    throw new OperationalError("AUTOMATIC_COLLECTION_CONFIRMATION_REQUIRED", TEXT.confirmationRequired, 422);
  }
  const context = await prepare(raw, deps);
  const attempt = await context.store.readLatestAttempt({
    organizationId: context.input.organizationId,
    invoiceId: context.input.invoiceId,
  });
  if (!attempt || !OPEN_STATUSES.has(attempt.status)) {
    throw new OperationalError("AUTOMATIC_COLLECTION_NOTHING_PENDING", TEXT.nothingToReview, 409);
  }
  if (!attempt.hasReviewNotice && attempt.resumeCount < FAMILY_COLLECTION_MAX_RESUMES) {
    throw new OperationalError("AUTOMATIC_COLLECTION_REVIEW_NOT_NEEDED", TEXT.reviewNotNeeded, 409);
  }

  const refs = await context.store.loadAttemptRefs(attempt);
  if (!refs) {
    // Con un cobro guardado que no se puede leer, el dinero pudo moverse: no
    // se cierra. Sin cobro guardado y sin cuenta con la que buscarlo, el
    // proceso diario nunca pudo crearlo (los crea con esos mismos datos).
    if (attempt.paymentIntentId) {
      throw new OperationalError("AUTOMATIC_COLLECTION_NEEDS_SUPPORT", TEXT.unreadable, 409);
    }
    await close(context, attempt, "reviewed_by_academy");
    return { outcome: "reviewed" };
  }

  // El cobro guardado o, si no hay, todos los que Stripe tenga para el intento.
  let paymentIntentIds: string[];
  if (attempt.paymentIntentId) {
    paymentIntentIds = [attempt.paymentIntentId];
  } else {
    try {
      const found = await context.gateway.listPaymentsByAttempt({
        connectedAccount: refs.connectedAccount,
        attemptId: attempt.id,
      });
      paymentIntentIds = found.map((payment) => payment.id);
    } catch {
      throw unverified();
    }
  }

  if (paymentIntentIds.length === 1) {
    const paymentIntentId = paymentIntentIds[0];
    const state = await stopInStripe(context.gateway, refs.connectedAccount, paymentIntentId);
    if (state === "succeeded") {
      if (await recordCollected(context, attempt, paymentIntentId)) return { outcome: "collected" };
      // Ya registrado para otro intento: el dinero está en el libro; se cierra.
    } else if (state === "processing") {
      throw new OperationalError("AUTOMATIC_COLLECTION_PROCESSING", TEXT.processing, 409);
    } else if (state === "unknown") {
      throw unverified();
    }
  } else if (paymentIntentIds.length > 1) {
    await stopAllOrRefuse(context, refs.connectedAccount, paymentIntentIds);
  }

  await close(context, attempt, "reviewed_by_academy");
  return { outcome: "reviewed" };
}
