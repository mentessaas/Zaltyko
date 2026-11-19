/**
 * Cobro automático de cuotas (Fase 3): pasos que comparten las dos fases del
 * proceso diario (family-collection-service.ts).
 *
 * Un intento avanza por pasos cortos y repetibles: buscar su cobro en Stripe
 * (o crearlo) → guardar el `pi_…` → confirmarlo → aplicar el resultado. Cada
 * llamada a Stripe va fuera de toda transacción: el almacén solo recibe datos
 * ya leídos.
 *
 * Reglas de dinero que se cumplen aquí:
 * - nunca se crea un segundo cobro: al reanudar se usa el `pi_…` guardado o se
 *   busca por el id del intento antes de crear, y un conflicto de clave de
 *   idempotencia deja el intento como está, con aviso a la academia;
 * - nunca se marca un intento como fallido sin haber leído su cobro en Stripe
 *   (o, si nunca se creó, sin haberlo buscado); solo un rechazo seguro de
 *   Stripe al crearlo (finalCreateErrorCode: no se creó nada) o un importe
 *   bajo el mínimo de Stripe lo cierran como `canceled` sin más;
 * - un cobro hecho solo se registra si Stripe cobró justo el importe del
 *   intento y en euros (lo comprueba el almacén);
 * - un cobro que el banco dejó pendiente de autenticación se cancela antes de
 *   darlo por fallido, para que no pueda completarse después. Fase 4: con
 *   `authenticationRecovery`, si es de tarjeta y llega antes de su plazo, no
 *   se cancela: el intento queda `requires_action` y la familia lo confirma
 *   (nunca se reintenta solo); al pasar el plazo se cancela y se cierra;
 * - antes de crear o confirmar al reanudar, se repite la puerta completa:
 *   nunca se cobra a quien ya no paga, ni una factura cuya familia ya recibió
 *   un recordatorio de pago (`reminder_sent`);
 * - con la domiciliación sin activar (`sepaEnabled` apagada) nunca se crea un
 *   cobro por domiciliación (`sepa_not_enabled`); las que ya están en el banco
 *   se siguen leyendo y registrando;
 * - Fase 4 (D9): cortacircuitos de la pasada (domain/circuit-breaker.ts). Cada
 *   creación de cobro se cuenta; abierto (3 rechazos de la plataforma seguidos,
 *   o el 20 % a partir de 10 creaciones), no se crea ni se cierra ningún
 *   intento más: se quedan como están y se reanudan otro día.
 *
 * Fase 4: los eventos de Stripe (family-collection-events.ts) usan estos
 * mismos pasos (`settleOutcome`, `cancelThenClose`, `settleLateSuccess`): el
 * evento solo hace que se relea el cobro antes.
 */
import { logger } from "@/lib/logger";
import {
  ACCOUNT_FRESHNESS_MS,
  evaluateFamilyCollectionGate,
  SEPA_NOT_ENABLED_REASON,
  type FamilyCollectionGateClassification,
  type FamilyCollectionGateInput,
} from "@/modules/family-collection/domain/collection-gate";
import {
  AMOUNT_BELOW_MINIMUM_CODE,
  isBelowCollectionMinimum,
  localCalendarDate,
  planInvoiceCollection,
  type CollectionPlan,
} from "@/modules/family-collection/domain/collection-plan";
import {
  recordCreateResult,
  type BreakerState,
  type CreateResult,
} from "@/modules/family-collection/domain/circuit-breaker";
import {
  CANCELED_IN_STRIPE_CODE,
  finalCreateErrorCode,
  isAuthenticationRequiredFailure,
  isPlatformInvalidRequest,
  mapPaymentIntent,
  mapUnknownPaymentError,
  receivedOf,
  snapshotOfPaymentIntent,
  type PaymentFailure,
  type PaymentIntentSnapshot,
  type PaymentOutcome,
} from "@/modules/family-collection/domain/payment-outcome";
import { nextRetry } from "@/modules/family-collection/domain/retry-policy";
import {
  AUTHENTICATION_EXPIRED_CODE,
  authenticationDeadline,
  isAuthenticationDeadlinePassed,
} from "@/modules/family-collection/domain/authentication-window";
import { stripeReadFailureOf } from "@/modules/family-collection/domain/stripe-read-error";
import type {
  AttemptOutcome,
  AttemptStripeRefs,
  CollectionAllocationRow,
  CollectionAttempt,
  CollectionChargeRow,
  CollectionInvoiceRow,
  FamilyCollectionStore,
  InvoiceCollectionContext,
  OrganizationScope,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  FAMILY_COLLECTION_MAX_RESUMES,
  type FamilyCollectionAttemptStatus,
} from "@/modules/family-collection/infrastructure/family-collection-schema";
import type { FamilyCollectionGateway } from "@/modules/family-collection/infrastructure/stripe-collection-gateway";

/** Código de un intento que se agotó sin poder saber nada de Stripe. */
export const TRANSIENT_EXHAUSTED_CODE = "transient_exhausted";

/** Un intento a medias solo se reanuda pasados 15 minutos sin cambios (la búsqueda de Stripe tarda en reflejarlo). */
export const RESUME_STALE_MS = 15 * 60 * 1000;

const MULTIPLE_PAYMENTS_ERROR = "FAMILY_COLLECTION_MULTIPLE_PAYMENTS_FOR_ATTEMPT";
const INTENT_MISMATCH_ERROR = "FAMILY_COLLECTION_INTENT_MISMATCH";

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export interface FamilyCollectionRunResult {
  /** Se cobró lo que vence hoy (bandera encendida). Con la bandera apagada solo se pone al día lo que quedó a medias. */
  enabled: boolean;
  /** `false` si se agotó el tiempo; lo que falte sigue en la siguiente ejecución. */
  complete: boolean;
  /** Intentos a medias o en curso que la Fase A llevó a otro estado. */
  reconciled: number;
  collected: number;
  processing: number;
  failed: number;
  canceled: number;
  skipped: Record<string, number>;
  retried: number;
  resumed: number;
  needsReview: number;
  /**
   * Fase 4 (D9): el cortacircuitos se abrió en esta pasada (demasiados
   * rechazos de Stripe de toda la plataforma al crear cobros). No se reclamó
   * ni se creó nada más; mañana se vuelve a intentar.
   */
  circuitOpen: boolean;
}

export function emptyRunResult(enabled: boolean): FamilyCollectionRunResult {
  return {
    enabled,
    complete: true,
    reconciled: 0,
    collected: 0,
    processing: 0,
    failed: 0,
    canceled: 0,
    skipped: {},
    retried: 0,
    resumed: 0,
    needsReview: 0,
    circuitOpen: false,
  };
}

export interface RunState {
  now: Date;
  /** Instante (reloj real) a partir del cual no se empieza nada nuevo. */
  deadline: number;
  batchSize: number;
  environment: "test" | "live";
  productionDatabase: boolean;
  flagEnabled: boolean;
  /**
   * La domiciliación se cobra sola (ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED).
   * Apagada, nunca se crea un cobro por domiciliación.
   */
  sepaEnabled: boolean;
  /**
   * Fase 4: cuando el banco pide que la familia confirme un cobro de tarjeta,
   * el intento espera en `requires_action` con su plazo en vez de fallar.
   * Bandera de eventos (ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED) y bandera
   * del cobro encendidas y almacenamiento con la forma "phase4". Sin ella,
   * como en la Fase 3: se cancela en Stripe y queda `failed`. Solo decide si
   * se ENTRA en `requires_action`: un intento que ya está así sigue hasta su
   * plazo (nunca se queda sin cerrar).
   */
  authenticationRecovery: boolean;
  store: FamilyCollectionStore;
  gateway: FamilyCollectionGateway;
  /** Academias a recorrer; `null` = todas (producción). Solo los tests lo limitan. */
  scope: OrganizationScope;
  refreshAccount: (accountRowId: string) => Promise<unknown>;
  /** Academias cuya cuenta ya se releyó en esta ejecución (una vez por academia). */
  refreshedOrganizations: Set<string>;
  /**
   * Fase 4 (Tarea 7): anota las devoluciones que Stripe ya hizo de un cobro
   * que el libro acaba de registrar tarde (applyRecordedAttemptRefunds).
   * Fuera de toda transacción. Sin ella (tests con una pasarela simulada y
   * sin devoluciones simuladas), no se mira nada.
   */
  applyRecordedRefunds?: ((attempt: CollectionAttempt, connectedAccount: string) => Promise<unknown>) | null;
  /**
   * Fase 4 (D9): cortacircuitos de la pasada (domain/circuit-breaker.ts).
   * Cuenta cada creación de cobro; abierto, no se crea ni se reclama nada más.
   */
  breaker: BreakerState;
  result: FamilyCollectionRunResult;
}

export function isExpired(state: RunState): boolean {
  return Date.now() >= state.deadline;
}

export function countSkip(state: RunState, reason: string): void {
  state.result.skipped[reason] = (state.result.skipped[reason] ?? 0) + 1;
}

/** Motivo de omisión de lo que se deja como está con el cortacircuitos abierto. */
export const CIRCUIT_OPEN_REASON = "circuit_open";

/**
 * Motivo de omisión de un intento cuyo cobro Stripe rechazó crear con un 400
 * de toda la plataforma (isPlatformInvalidRequest) antes de que salte el
 * cortacircuitos: se queda `claimed` y se reanuda otro día.
 */
export const PLATFORM_INVALID_REQUEST_REASON = "platform_invalid_request";

/**
 * Fase 4 (D9): cuenta una creación en el cortacircuitos. Al abrirse, una sola
 * vez por pasada (luego sigue abierto), deja `circuitOpen` en el resultado y
 * un error en el registro operativo (va a Sentry) con solo dos contadores:
 * nunca ids, importes ni datos de familias.
 */
function recordCreate(state: RunState, result: CreateResult): void {
  const wasOpen = state.breaker.open;
  state.breaker = recordCreateResult(state.breaker, result);
  if (wasOpen || !state.breaker.open) return;
  state.result.circuitOpen = true;
  logger.error("Cobro automático: parado por errores de Stripe al crear cobros", undefined, {
    created: state.breaker.created,
    invalid: state.breaker.invalid,
  });
}

/** Motivo final cuando las cuotas no tienen un periodo con el que describir el cobro. */
export const INVALID_SERVICE_PERIOD_CODE = "invalid_service_period";

const SERVICE_PERIOD_PATTERN = /^(\d{4})-(\d{2})-\d{2}$/;

/** ¿Se puede describir el cobro con este primer día del periodo (YYYY-MM-DD)? */
export function isValidServicePeriod(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const match = SERVICE_PERIOD_PATTERN.exec(value);
  const month = match ? Number(match[2]) : NaN;
  return match !== null && month >= 1 && month <= 12;
}

/** «Cuota noviembre 2026» a partir del primer día del periodo (YYYY-MM-DD). */
export function collectionDescription(servicePeriodStart: string): string {
  const match = SERVICE_PERIOD_PATTERN.exec(servicePeriodStart);
  if (!match || !isValidServicePeriod(servicePeriodStart)) {
    throw new RangeError("El periodo de la cuota no es una fecha válida.");
  }
  return `Cuota ${MONTHS_ES[Number(match[2]) - 1]} ${match[1]}`;
}

/** Primer día del periodo más antiguo de unas cuotas, o null. */
export function earliestServicePeriod(charges: readonly CollectionChargeRow[]): string | null {
  const periods = charges.map((charge) => charge.servicePeriodStart).sort();
  return periods[0] ?? null;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

function errorCode(error: unknown): string | null {
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)) return error.message;
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : null;
}

/** Solo ids y nombres de error: nunca mensajes de Stripe ni de la base. */
export function logStepFailure(
  message: string,
  error: unknown,
  ids: { organizationId: string; invoiceId: string; attemptId?: string }
): void {
  logger.error(message, undefined, { ...ids, errorName: errorName(error), errorCode: errorCode(error) });
}

// ---------------------------------------------------------------------------
// Contexto y puerta
// ---------------------------------------------------------------------------

function isAccountFresh(lastSyncedAt: Date | string | null, now: Date): boolean {
  if (lastSyncedAt === null) return false;
  const time = (lastSyncedAt instanceof Date ? lastSyncedAt : new Date(lastSyncedAt)).getTime();
  return Number.isFinite(time) && now.getTime() - time <= ACCOUNT_FRESHNESS_MS;
}

/**
 * Contexto de la factura, con la cuenta conectada releída en Stripe si su
 * última lectura tiene más de una hora (una vez por academia y ejecución).
 */
export async function loadFreshContext(
  state: RunState,
  organizationId: string,
  invoiceId: string
): Promise<InvoiceCollectionContext | null> {
  const load = () =>
    state.store.loadInvoiceContext({ organizationId, invoiceId, environment: state.environment, now: state.now });
  const context = await load();
  if (
    !context?.account ||
    isAccountFresh(context.account.lastSyncedAt, state.now) ||
    state.refreshedOrganizations.has(organizationId)
  ) {
    return context;
  }
  state.refreshedOrganizations.add(organizationId);
  try {
    await state.refreshAccount(context.account.id);
  } catch (error) {
    logger.warn("Cobro automático: no se pudo releer la cuenta conectada", {
      organizationId,
      errorName: errorName(error),
    });
  }
  return load();
}

export function planFor(
  invoice: CollectionInvoiceRow,
  charges: readonly CollectionChargeRow[],
  todayLocal: string,
  collectionDayOfMonth: number | null
): CollectionPlan {
  return planInvoiceCollection({
    invoice: { id: invoice.id, isMonthly: invoice.isMonthly, status: invoice.status, currency: invoice.currency },
    charges: charges.map((charge) => ({
      id: charge.id,
      collectionMode: charge.collectionMode,
      status: charge.status,
      currency: charge.currency,
      outstandingCents: charge.outstandingCents,
      dueAt: charge.dueAt,
    })),
    todayLocal,
    collectionDayOfMonth,
    timezone: invoice.timezone,
  });
}

export function buildGateInput(
  state: RunState,
  context: InvoiceCollectionContext,
  charges: readonly CollectionChargeRow[],
  todayLocal: string
): FamilyCollectionGateInput {
  const invoice = context.invoice;
  return {
    flagEnabled: state.flagEnabled,
    environment: state.environment,
    productionDatabase: state.productionDatabase,
    storageAvailable: true,
    reminderSent: context.reminderSent,
    sepaEnabled: state.sepaEnabled,
    organization: context.organization,
    entitlement: context.plan.entitlement,
    subscription: context.plan.subscription,
    // Sin fila de preferencia, la familia está en manual.
    preference: {
      organizationId: invoice.organizationId,
      familyId: invoice.familyId,
      requestedMode: context.preference?.requestedMode ?? "manual",
      entitlementRevision: context.preference?.entitlementRevision ?? null,
    },
    planChangeRevision: context.planChangeRevision,
    invoice: {
      organizationId: invoice.organizationId,
      familyId: invoice.familyId,
      familyPayerId: invoice.familyPayerId,
      currency: invoice.currency,
    },
    charges: charges.map((charge) => ({
      id: charge.id,
      organizationId: charge.organizationId,
      familyId: charge.familyId,
      familyPayerId: charge.familyPayerId,
      collectionMode: charge.collectionMode,
    })),
    providerAccount: context.account,
    authorization: context.authorization,
    customerReference: context.customerReference,
    payer: context.payer,
    todayLocal,
    now: state.now,
  };
}

/**
 * ¿Sigue debiéndose exactamente el reparto de un intento? Devuelve el motivo
 * si no: factura cerrada, cuota anulada, cuota pagada (o con menos saldo) o
 * reparto que ya no coincide.
 */
export function staleAllocationReason(
  context: InvoiceCollectionContext,
  allocations: readonly CollectionAllocationRow[]
): string | null {
  if (context.invoice.status !== "issued" && context.invoice.status !== "partially_paid") {
    return "invoice_closed";
  }
  const charges = new Map(context.charges.map((charge) => [charge.id, charge]));
  for (const allocation of allocations) {
    const charge = charges.get(allocation.chargeId);
    if (!charge) return "charge_scope_mismatch";
    if (charge.status === "void") return "charge_void";
    if (charge.status === "paid" || charge.outstandingCents < allocation.amountCents) return "charge_settled";
    if (charge.collectionMode !== "automatic" || charge.outstandingCents !== allocation.amountCents) {
      return "plan_changed";
    }
  }
  return null;
}

type RecheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; classification: FamilyCollectionGateClassification };

/**
 * Puerta completa para un intento que se reanuda, sobre sus propias cuotas.
 * Además, la autorización, la cuenta y el tipo de pago del intento deben ser
 * los vigentes: si la familia cambió de método, el intento no sigue.
 */
async function recheckGate(
  state: RunState,
  attempt: CollectionAttempt,
  refs: AttemptStripeRefs
): Promise<RecheckResult> {
  const context = await loadFreshContext(state, attempt.organizationId, attempt.invoiceId);
  if (!context) return { allowed: false, reason: "charge_scope_mismatch", classification: "final" };
  const chargeIds = new Set(refs.allocations.map((allocation) => allocation.chargeId));
  const charges = context.charges.filter((charge) => chargeIds.has(charge.id));
  if (charges.length === 0 || charges.length !== chargeIds.size) {
    return { allowed: false, reason: "charge_scope_mismatch", classification: "final" };
  }
  // Antes de mover dinero: el reparto del intento debe seguir siendo lo que
  // se debe (nada pagado a mano, anulado ni cerrado desde que se reclamó).
  const stale = staleAllocationReason(context, refs.allocations);
  if (stale) return { allowed: false, reason: stale, classification: "final" };
  const todayLocal = localCalendarDate(state.now, context.invoice.timezone);
  const gate = evaluateFamilyCollectionGate(buildGateInput(state, context, charges, todayLocal));
  const sameAuthorization =
    context.authorization?.id === attempt.authorizationId &&
    context.account?.id === attempt.paymentProviderAccountId;
  if (!gate.allowed) {
    // «La domiciliación no se cobra sola» habla de la autorización de hoy. Si
    // ya no es la del intento (p. ej. un intento con tarjeta y la familia se
    // pasó a domiciliación), lo que de verdad pasó es que cambió el método de
    // pago: se cierra con el motivo de la autorización.
    if (gate.reason === SEPA_NOT_ENABLED_REASON && !sameAuthorization) {
      return { allowed: false, reason: "authorization_inactive", classification: "final" };
    }
    return gate;
  }
  if (!sameAuthorization || gate.paymentMethodKind !== attempt.paymentMethodKind) {
    return { allowed: false, reason: "authorization_inactive", classification: "final" };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Escrituras y avisos
// ---------------------------------------------------------------------------

/** Aplica un resultado al intento y lo cuenta. Devuelve el estado escrito, o null. */
async function apply(
  state: RunState,
  attempt: CollectionAttempt,
  outcome: AttemptOutcome
): Promise<FamilyCollectionAttemptStatus | null> {
  const result = await state.store.applyOutcome({
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
    outcome,
    environment: state.environment,
    now: state.now,
  });
  if (!result.applied) {
    if (result.review) {
      // P. ej. el cobro ya estaba registrado para otro intento: ni cobrado ni
      // fallido; el almacén dejó el aviso a la academia.
      countSkip(state, result.review);
      state.result.needsReview += 1;
      return null;
    }
    // Otro proceso ya lo cerró: no se toca.
    countSkip(state, "concurrent");
    return null;
  }
  const counters = state.result;
  if (result.status === "succeeded") {
    counters.collected += 1;
    if (result.allocationStatus === "needs_review") counters.needsReview += 1;
  } else if (result.status === "processing") {
    counters.processing += 1;
  } else if (result.status === "failed") {
    counters.failed += 1;
  } else if (result.status === "canceled") {
    counters.canceled += 1;
  } else if (result.status === "requires_action") {
    // Fase 4: ni cobrado ni fallido; la familia tiene que confirmarlo.
    countSkip(state, "requires_action");
  }
  return result.status;
}

/** Aviso a la academia para revisar el intento (una vez por intento y motivo). */
/** Deja el aviso de revisión (una sola vez). `true` si se registró ahora; `false` si ya estaba. */
export async function notifyReview(state: RunState, attempt: CollectionAttempt, reason: string): Promise<boolean> {
  const written = await state.store.recordNotice({
    organizationId: attempt.organizationId,
    locationId: attempt.locationId,
    attemptId: attempt.id,
    invoiceId: attempt.invoiceId,
    reason,
    now: state.now,
  });
  if (written) state.result.needsReview += 1;
  return written;
}

async function reportIdempotencyConflict(state: RunState, attempt: CollectionAttempt): Promise<void> {
  // Nunca se crea otro cobro: el intento se queda como está y lo revisa una persona.
  logger.error("Cobro automático: Stripe rechazó la clave de idempotencia", undefined, {
    organizationId: attempt.organizationId,
    invoiceId: attempt.invoiceId,
    attemptId: attempt.id,
  });
  countSkip(state, "idempotency_conflict");
  await notifyReview(state, attempt, "idempotency_conflict");
}

/** Errores del almacén que deben llegar a la academia además de al registro. */
export async function notifyStepError(state: RunState, attempt: CollectionAttempt, error: unknown): Promise<void> {
  if (error instanceof Error && error.message === INTENT_MISMATCH_ERROR) {
    await notifyReview(state, attempt, "intent_mismatch");
    return;
  }
  // El cobro de Stripe ya está registrado con otro importe o academia.
  if (errorCode(error) === "IDEMPOTENCY_CONFLICT") {
    await notifyReview(state, attempt, "payment_conflict");
  }
}

// ---------------------------------------------------------------------------
// Avance de un intento
// ---------------------------------------------------------------------------

function isFailedOutcome(outcome: PaymentOutcome): outcome is { failed: PaymentFailure } {
  return typeof outcome === "object" && outcome !== null && "failed" in outcome;
}

/** Cómo se cierra un intento cuyo cobro se cancela en Stripe (cancelThenClose). */
export type AttemptClose =
  | { kind: "failed"; code: string; declineCode: string | null }
  | { kind: "canceled"; reason: string };

/**
 * Cancela en Stripe el cobro del intento y, solo si Stripe confirma la
 * cancelación, cierra el intento. Si Stripe ya no deja cancelarlo, se relee y
 * se aplica lo que diga (un cobro hecho nunca queda como fallido).
 *
 * Fase 4: también la usa el cobro tardío para cancelar el cobro de un intento
 * hermano abierto (`late_success_elsewhere`) antes de registrar el tardío.
 * Siempre fuera de cualquier transacción. Con `stripeErrors: "throw"` (el
 * evento de Stripe), un error pasajero de Stripe al cancelar o releer sigue
 * hacia arriba con su propio código; uno permanente nunca sube (N1): el
 * intento se queda abierto, como con `"skip"`.
 */
export async function cancelThenClose(
  state: RunState,
  attempt: CollectionAttempt,
  refs: AttemptStripeRefs,
  close: AttemptClose,
  options: { stripeErrors?: "skip" | "throw"; permanentErrorNotice?: string } = {}
): Promise<FamilyCollectionAttemptStatus | null> {
  const paymentIntentId = attempt.paymentIntentId;
  if (!paymentIntentId) throw new Error("FAMILY_COLLECTION_INTENT_REQUIRED");
  // N1: con `"throw"` solo sube un error pasajero (Stripe reenvía el evento y
  // se arregla). Uno permanente (cobro inexistente, permiso perdido) saldría
  // igual en cada reenvío: se cuenta y el intento se queda abierto, como en
  // `"skip"`, para que quien llama decida (el cobro tardío queda en espera).
  // Con `permanentErrorNotice` (modo `"skip"`), un error permanente no se
  // cuenta como pasajero: el intento sigue abierto (su dinero pudo moverse)
  // y la academia recibe ese aviso, que le abre «Marcar como revisado».
  const stripeFailed = async (error: unknown): Promise<null> => {
    const failure = stripeReadFailureOf(error);
    if (options.stripeErrors !== "throw") {
      if (failure.permanent && options.permanentErrorNotice) {
        // Solo ids, nombre y código del error: nunca su mensaje.
        logger.warn("Cobro automático: Stripe no deja cancelar o releer un cobro (error permanente); se avisa a la academia", {
          organizationId: attempt.organizationId,
          invoiceId: attempt.invoiceId,
          attemptId: attempt.id,
          errorName: failure.errorName,
          errorCode: failure.errorCode,
        });
        countSkip(state, "stripe_unreadable");
        await notifyReview(state, attempt, options.permanentErrorNotice);
        return null;
      }
      countSkip(state, "transient");
      return null;
    }
    if (!failure.permanent) throw error;
    // Solo ids, nombre y código del error: nunca su mensaje.
    logger.warn("Cobro automático: Stripe no deja cancelar o releer un cobro (error permanente); el intento sigue abierto", {
      organizationId: attempt.organizationId,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
      errorName: failure.errorName,
      errorCode: failure.errorCode,
    });
    countSkip(state, "stripe_unreadable");
    return null;
  };
  let canceled: "canceled" | "not_cancelable";
  try {
    canceled = await state.gateway.cancelPayment({ connectedAccount: refs.connectedAccount, paymentIntentId });
  } catch (error) {
    return stripeFailed(error);
  }
  const closing: AttemptOutcome =
    close.kind === "failed"
      ? { kind: "failed", paymentIntentId, code: close.code, declineCode: close.declineCode, nextRetryAt: null }
      : { kind: "canceled", paymentIntentId, reason: close.reason };
  if (canceled === "canceled") return apply(state, attempt, closing);
  let snapshot: PaymentIntentSnapshot;
  try {
    snapshot = await state.gateway.retrievePayment({ connectedAccount: refs.connectedAccount, paymentIntentId });
  } catch (error) {
    return stripeFailed(error);
  }
  const outcome = mapPaymentIntent(snapshot);
  // Ya estaba cancelado sin ningún error de pago (p. ej. desde el panel de
  // Stripe): el cobro ya no puede completarse; se cierra como se quería.
  if (outcome === CANCELED_IN_STRIPE_CODE) return apply(state, attempt, closing);
  if (outcome === "succeeded" || outcome === "processing" || isFailedOutcome(outcome)) {
    return settleOutcome(state, attempt, refs, outcome, snapshot, { lastChance: false, allowCancel: false });
  }
  countSkip(state, "transient");
  return null;
}

/**
 * Aplica lo que Stripe dijo del cobro de un intento que ya tiene `pi_…`.
 * - `succeeded`: pago registrado y reparto (needs_review es un resultado normal);
 * - `processing`: queda en curso (lo cierra la relectura de un día siguiente);
 * - fallo: antes de registrarlo, si el banco pidió autenticación, se cancela el
 *   cobro para que no pueda completarse después; reintento según la política;
 * - cancelado en Stripe sin ningún error de pago: se cierra como `canceled`
 *   (`canceled_in_stripe`), sin aviso a la familia y sin reintento (no es un
 *   rechazo del banco);
 * - sin resultado: el intento se queda como está; en su última reanudación se
 *   cancela en Stripe y se cierra;
 * - conflicto de idempotencia: se queda como está, con aviso.
 *
 * Fase 4, el banco pide que la familia confirme el pago:
 * - al entrar (tarjeta, `authenticationRecovery`, Stripe en
 *   `requires_payment_method`/`requires_action` y antes del plazo, que sale
 *   de `refs.windowAnchorLocalDate`): `requires_action` con el plazo, SIN
 *   cancelar el cobro en Stripe (la familia lo confirma). Sin fecha de
 *   ventana, sin recuperación o ya pasado el plazo, como en la Fase 3;
 * - un intento que ya está `requires_action` (settleAwaitingAuthentication):
 *   cobrado o en curso se aplica; cancelado sin error, `canceled_in_stripe`;
 *   sin cobrar todavía, antes del plazo nada cambia (la familia puede volver
 *   a intentarlo); pasado el plazo se cancela en Stripe y se cierra `failed`
 *   (`authentication_required`, sin reintento: vuelven los recordatorios).
 */
export async function settleOutcome(
  state: RunState,
  attempt: CollectionAttempt,
  refs: AttemptStripeRefs,
  outcome: PaymentOutcome,
  snapshot: PaymentIntentSnapshot | null,
  options: { lastChance: boolean; allowCancel: boolean }
): Promise<FamilyCollectionAttemptStatus | null> {
  const paymentIntentId = attempt.paymentIntentId;
  if (!paymentIntentId) throw new Error("FAMILY_COLLECTION_INTENT_REQUIRED");

  if (outcome === "succeeded") {
    // Con lo que Stripe dice que cobró: si no cuadra, el almacén no lo registra.
    return apply(state, attempt, { kind: "succeeded", paymentIntentId, received: receivedOf(snapshot) });
  }

  if (outcome === "processing") {
    if (attempt.status === "processing") {
      state.result.processing += 1;
      return null;
    }
    return apply(state, attempt, { kind: "processing", paymentIntentId });
  }

  if (outcome === "idempotency_conflict") {
    await reportIdempotencyConflict(state, attempt);
    return null;
  }

  if (outcome === CANCELED_IN_STRIPE_CODE) {
    // Nadie lo rechazó: lo canceló Zaltyko, la academia o alguien desde el
    // panel de Stripe. Ya no puede completarse: se cierra sin decir a la
    // familia que el banco no lo aceptó y sin reintento.
    return apply(state, attempt, { kind: "canceled", paymentIntentId, reason: CANCELED_IN_STRIPE_CODE });
  }

  // Fase 4: el intento ya espera a que la familia confirme el pago.
  if (attempt.status === "requires_action") {
    return settleAwaitingAuthentication(state, attempt, refs, outcome, snapshot, options);
  }

  if (isFailedOutcome(outcome)) {
    const failure = outcome.failed;
    const awaitingAction = snapshot?.status === "requires_action";
    // Fase 4: el banco pide confirmar y la familia aún está a tiempo → espera
    // en `requires_action`, sin cancelar el cobro en Stripe.
    if (
      options.allowCancel &&
      (awaitingAction || isAuthenticationRequiredFailure(failure)) &&
      snapshot !== null &&
      (snapshot.status === "requires_payment_method" || snapshot.status === "requires_action") &&
      snapshot.id === paymentIntentId
    ) {
      const deadline = authenticationDeadlineFor(state, attempt, refs);
      if (deadline !== null && !isAuthenticationDeadlinePassed(deadline, state.now)) {
        return apply(state, attempt, { kind: "requires_action", paymentIntentId, actionDeadlineAt: deadline });
      }
    }
    // Los reintentos se cuentan desde el día local del intento 1 (D1). Sin
    // esa fecha no se programa ninguno: la cuota pasa a cobro manual.
    const firstAttemptClaimedAt = attempt.attemptNumber === 1 ? attempt.claimedAt : refs.firstAttemptClaimedAt;
    const nextRetryAt =
      attempt.paymentMethodKind === null || firstAttemptClaimedAt === null
        ? null
        : nextRetry({
            kind: attempt.paymentMethodKind,
            attemptNumber: attempt.attemptNumber,
            code: failure.code,
            declineCode: failure.declineCode,
            firstAttemptClaimedAt,
            now: state.now,
            timezone: refs.timezone,
          });
    // Se cancela en Stripe antes de registrar el fallo cuando el banco pidió
    // autenticación (para que no pueda completarse después) y cuando habrá
    // reintento (el intento siguiente crea otro cobro: el de este no debe
    // poder confirmarse nunca). Un cobro ya cancelado no se toca.
    const shouldCancel =
      snapshot?.status !== "canceled" &&
      (awaitingAction || isAuthenticationRequiredFailure(failure) || nextRetryAt !== null);
    if (shouldCancel) {
      if (!options.allowCancel) {
        // Ya se intentó cancelar y Stripe lo dejó esperando: no se da por fallido.
        if (awaitingAction) {
          countSkip(state, "transient");
          return null;
        }
      } else {
        let canceled: "canceled" | "not_cancelable" | "error";
        try {
          canceled = await state.gateway.cancelPayment({ connectedAccount: refs.connectedAccount, paymentIntentId });
        } catch {
          canceled = "error";
        }
        if (canceled === "not_cancelable") {
          // Cambió mientras tanto: se relee y se aplica lo que diga.
          let reread: PaymentIntentSnapshot;
          try {
            reread = await state.gateway.retrievePayment({ connectedAccount: refs.connectedAccount, paymentIntentId });
          } catch {
            countSkip(state, "transient");
            return null;
          }
          return settleOutcome(state, attempt, refs, mapPaymentIntent(reread), reread, {
            lastChance: options.lastChance,
            allowCancel: false,
          });
        }
        // Esperando autenticación y sin poder cancelarlo: podría completarse; se relee otro día.
        if (canceled === "error" && awaitingAction) {
          countSkip(state, "transient");
          return null;
        }
      }
    }
    return apply(state, attempt, {
      kind: "failed",
      paymentIntentId,
      code: failure.code,
      declineCode: failure.declineCode,
      nextRetryAt,
    });
  }

  // `transient` o `requires_confirmation` después de confirmar: sin resultado.
  if (options.lastChance) {
    return cancelThenClose(state, attempt, refs, { kind: "failed", code: TRANSIENT_EXHAUSTED_CODE, declineCode: null });
  }
  countSkip(state, "transient");
  return null;
}

/**
 * Fase 4: plazo para confirmar el pago si el intento puede esperar a la
 * familia (`authenticationRecovery`, tarjeta y fecha de su ventana de cobro);
 * si no, null (comportamiento de la Fase 3).
 */
function authenticationDeadlineFor(state: RunState, attempt: CollectionAttempt, refs: AttemptStripeRefs): Date | null {
  if (!state.authenticationRecovery || attempt.paymentMethodKind !== "card" || !refs.windowAnchorLocalDate) {
    return null;
  }
  try {
    return authenticationDeadline({ anchorLocalDate: refs.windowAnchorLocalDate, timezone: refs.timezone });
  } catch {
    // Fecha o zona ilegibles: sin plazo no se espera (Fase 3).
    return null;
  }
}

/**
 * Aviso a la academia (Tarea M, puntos 4 y 5): un intento `requires_action`
 * cuyo plazo para confirmar el pago ya pasó y que Stripe no deja leer ni
 * cancelar. Abre «Marcar como revisado», que vuelve a leer Stripe y solo con
 * un error permanente comprobado lo cierra como `reviewed_unverifiable`.
 */
export const REQUIRES_ACTION_UNREADABLE_REASON = "requires_action_unreadable";

/** Motivo contado cuando un intento `requires_action` sigue esperando a la familia. */
export const AWAITING_AUTHENTICATION_SKIP = "awaiting_authentication";

/**
 * Fase 4: un intento `requires_action` cuyo cobro aún no se ha cobrado ni
 * está en curso (fallo, sin resultado o sin confirmar). Quien llama ya aplicó
 * `succeeded`, `processing`, `canceled_in_stripe` e `idempotency_conflict`.
 * - Stripe ya lo canceló con un error de pago: no puede completarse; se
 *   cierra `failed` con ese código, sin reintento;
 * - antes del plazo (`action_deadline_at`): nada cambia, la familia puede
 *   volver a intentarlo; nunca se cancela (tampoco desde un evento);
 * - pasado el plazo: se cancela en Stripe y se cierra `failed`
 *   `authentication_required`, sin reintento (cancelThenClose: si Stripe ya
 *   lo cobró, se registra). Sin poder cancelar (`allowCancel: false`), se
 *   mira otro día.
 */
async function settleAwaitingAuthentication(
  state: RunState,
  attempt: CollectionAttempt,
  refs: AttemptStripeRefs,
  outcome: PaymentOutcome,
  snapshot: PaymentIntentSnapshot | null,
  options: { lastChance: boolean; allowCancel: boolean }
): Promise<FamilyCollectionAttemptStatus | null> {
  const paymentIntentId = attempt.paymentIntentId;
  if (!paymentIntentId) throw new Error("FAMILY_COLLECTION_INTENT_REQUIRED");
  if (isFailedOutcome(outcome) && snapshot?.status === "canceled") {
    return apply(state, attempt, {
      kind: "failed",
      paymentIntentId,
      code: outcome.failed.code,
      declineCode: outcome.failed.declineCode,
      nextRetryAt: null,
    });
  }
  const deadline = await state.store.readActionDeadline({
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
  });
  // Sin plazo es que el intento ya no está `requires_action` (la base exige
  // el plazo en ese estado): otro camino lo movió; no se toca.
  if (deadline === null) {
    countSkip(state, "concurrent");
    return null;
  }
  if (!isAuthenticationDeadlinePassed(deadline, state.now)) {
    countSkip(state, AWAITING_AUTHENTICATION_SKIP);
    return null;
  }
  if (!options.allowCancel) {
    countSkip(state, "transient");
    return null;
  }
  // Tarea M, punto 5: si Stripe no deja cancelarlo de forma permanente
  // (cuenta desconectada), el intento sigue abierto y la academia recibe el
  // aviso; si no, se quedaría `requires_action` para siempre sin que lo sepa.
  return cancelThenClose(
    state,
    attempt,
    refs,
    { kind: "failed", code: AUTHENTICATION_EXPIRED_CODE, declineCode: null },
    { permanentErrorNotice: REQUIRES_ACTION_UNREADABLE_REASON }
  );
}

/**
 * Fase 4: el cobro de un intento ya cerrado (`failed` o `canceled`) se
 * completó tarde en Stripe (`snapshot`, ya releído y `succeeded`). Se aplica
 * por applyOutcome como `late_succeeded`, con lo que Stripe dice que cobró;
 * el almacén decide con la factura bloqueada (otro intento ya cobrado →
 * `duplicate_collection`; otro abierto → LATE_SUCCESS_SIBLING_IN_FLIGHT).
 * Quien llama ya canceló en Stripe, fuera de transacción, los hermanos abiertos.
 */
export async function settleLateSuccess(
  state: RunState,
  attempt: CollectionAttempt,
  snapshot: PaymentIntentSnapshot
): Promise<FamilyCollectionAttemptStatus | null> {
  const paymentIntentId = attempt.paymentIntentId;
  if (!paymentIntentId || snapshot.id !== paymentIntentId) throw new Error(INTENT_MISMATCH_ERROR);
  return apply(state, attempt, { kind: "late_succeeded", paymentIntentId, received: receivedOf(snapshot) });
}

/**
 * Lleva un intento `claimed` o `created` hasta su resultado.
 *
 * - `collect`: recién reclamado hoy, con la puerta ya pasada; se crea el cobro.
 * - `resume`: tomado por la reanudación (más de 15 minutos a medias). Se usa el
 *   `pi_…` guardado o se busca por el id del intento antes de crear; antes de
 *   crear o confirmar se repite la puerta. En su tercera reanudación, sin cobro
 *   en Stripe queda `failed` (`transient_exhausted`), y con un cobro sin
 *   resultado se cancela en Stripe antes de cerrarlo.
 *
 * Devuelve el estado escrito, o null si el intento se quedó como estaba.
 */
export async function advanceAttempt(
  state: RunState,
  initial: CollectionAttempt,
  options: { phase: "collect" | "resume" }
): Promise<FamilyCollectionAttemptStatus | null> {
  const lastChance = options.phase === "resume" && initial.resumeCount >= FAMILY_COLLECTION_MAX_RESUMES;
  if (!lastChance) return advanceAttemptSteps(state, initial, options.phase, false);
  // Última reanudación: nunca vuelve a tomarse. Si no queda cerrado (o en
  // curso, que relee la Fase A), la academia recibe el aviso para revisarlo.
  let status: FamilyCollectionAttemptStatus | null = null;
  try {
    status = await advanceAttemptSteps(state, initial, options.phase, true);
    return status;
  } finally {
    if (status === null) {
      await notifyReview(state, initial, "resume_exhausted").catch(() => undefined);
    }
  }
}

async function advanceAttemptSteps(
  state: RunState,
  initial: CollectionAttempt,
  phase: "collect" | "resume",
  lastChance: boolean
): Promise<FamilyCollectionAttemptStatus | null> {
  let attempt = initial;
  const resuming = phase === "resume";
  let gateChecked = !resuming;

  const refs = await state.store.loadAttemptRefs(attempt);
  if (!refs) {
    await notifyReview(state, attempt, "attempt_unreadable");
    return null;
  }
  const connectedAccount = refs.connectedAccount;

  // 1. ¿Hay ya un cobro en Stripe para este intento?
  let snapshot: PaymentIntentSnapshot | null = null;
  if (attempt.paymentIntentId) {
    try {
      snapshot = await state.gateway.retrievePayment({ connectedAccount, paymentIntentId: attempt.paymentIntentId });
    } catch (error) {
      const outcome = mapUnknownPaymentError(error);
      return settleOutcome(state, attempt, refs, outcome === "idempotency_conflict" ? outcome : "transient", null, {
        lastChance,
        allowCancel: true,
      });
    }
  } else if (resuming) {
    try {
      snapshot = await state.gateway.findPaymentByAttempt({ connectedAccount, attemptId: attempt.id });
    } catch (error) {
      if (error instanceof Error && error.message === MULTIPLE_PAYMENTS_ERROR) {
        // Varios cobros para un intento: nunca se elige uno ni se da por fallido.
        logger.error("Cobro automático: varios cobros en Stripe para un intento", undefined, {
          organizationId: attempt.organizationId,
          invoiceId: attempt.invoiceId,
          attemptId: attempt.id,
        });
        countSkip(state, "multiple_payments");
        await notifyReview(state, attempt, "multiple_payments");
        return null;
      }
      countSkip(state, "transient");
      return null;
    }
    if (snapshot) {
      if (
        !(await state.store.markCreated({
          organizationId: attempt.organizationId,
          attemptId: attempt.id,
          paymentIntentId: snapshot.id,
          now: state.now,
        }))
      ) {
        countSkip(state, "concurrent");
        return null;
      }
      attempt = { ...attempt, status: "created", paymentIntentId: snapshot.id };
    }
  }

  // 2. Sin cobro en Stripe: se crea (o, en la última reanudación, se cierra).
  if (!snapshot) {
    if (lastChance) {
      return apply(state, attempt, {
        kind: "failed",
        paymentIntentId: null,
        code: TRANSIENT_EXHAUSTED_CODE,
        declineCode: null,
        nextRetryAt: null,
      });
    }
    // Fase 4 (D9): con el cortacircuitos abierto no se crea nada más ni se
    // cierra el intento (ni por la puerta ni por otro motivo). Se queda como
    // está (`claimed`, sin cobro en Stripe) y lo reanuda la Fase A otro día.
    // La última reanudación (arriba) sí se cierra como siempre: no depende de
    // lo que diga Stripe y así nada se queda abierto para siempre.
    if (state.breaker.open) {
      countSkip(state, CIRCUIT_OPEN_REASON);
      return null;
    }
    if (!gateChecked) {
      const check = await recheckGate(state, attempt, refs);
      if (!check.allowed) {
        if (check.classification === "final") {
          return apply(state, attempt, { kind: "canceled", paymentIntentId: null, reason: check.reason });
        }
        countSkip(state, check.reason);
        return null;
      }
      gateChecked = true;
    }
    const kind = attempt.paymentMethodKind;
    const servicePeriodStart = refs.servicePeriodStart;
    if (!isValidServicePeriod(servicePeriodStart)) {
      return apply(state, attempt, { kind: "canceled", paymentIntentId: null, reason: INVALID_SERVICE_PERIOD_CODE });
    }
    if (!kind || !refs.customer || !refs.paymentMethod) {
      return apply(state, attempt, { kind: "canceled", paymentIntentId: null, reason: "payment_method_unknown" });
    }
    // Menos de 0,50 €: Stripe lo rechazaría siempre. Se cierra sin llamarle y
    // la cuota se cobra a mano.
    if (isBelowCollectionMinimum(attempt.amountCents)) {
      return apply(state, attempt, { kind: "canceled", paymentIntentId: null, reason: AMOUNT_BELOW_MINIMUM_CODE });
    }
    // Domiciliación sin activar: la puerta ya lo cierra antes de reclamar y al
    // reanudar; esto es la última comprobación antes de crear el cobro (nunca
    // se crea uno por domiciliación). No hay cobro en Stripe: se cierra sin más.
    if (kind === "sepa_debit" && !state.sepaEnabled) {
      return apply(state, attempt, { kind: "canceled", paymentIntentId: null, reason: SEPA_NOT_ENABLED_REASON });
    }
    try {
      snapshot = await state.gateway.createPayment({
        connectedAccount,
        attempt: { id: attempt.id, invoiceId: attempt.invoiceId, attemptNumber: attempt.attemptNumber },
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        customer: refs.customer,
        paymentMethod: refs.paymentMethod,
        kind,
        organizationId: attempt.organizationId,
        description: collectionDescription(servicePeriodStart),
      });
    } catch (error) {
      if (mapUnknownPaymentError(error) === "idempotency_conflict") {
        recordCreate(state, "other");
        await reportIdempotencyConflict(state, attempt);
        return null;
      }
      // Fase 4 (D9): un rechazo de toda la plataforma cuenta en el
      // cortacircuitos. Si lo abre, ESTE intento tampoco se cierra: Stripe no
      // creó nada (400), así que se queda `claimed` sin `pi_…` y la Fase A lo
      // reanuda otro día (lo busca por su id, repite la puerta y lo crea).
      const platformRejected = isPlatformInvalidRequest(error);
      recordCreate(state, platformRejected ? "platform_invalid_request" : "other");
      if (state.breaker.open) {
        countSkip(state, CIRCUIT_OPEN_REASON);
        return null;
      }
      // Revisión del coordinador (punto 1): los rechazos de toda la plataforma
      // de antes de que salte el cortacircuitos tampoco se cierran (esto
      // sustituye a C4 solo para ellos). Apuntan a cómo Zaltyko pide el cobro
      // (un despliegue roto), no a la familia: cerrarlos pasaría cada día
      // varias cuotas a cobro manual. Stripe respondió 400 sin cobro dentro,
      // así que no se movió dinero: el intento se queda `claimed` sin `pi_…`
      // ni escritura y la Fase A lo reanuda otro día (lo busca por su id,
      // repite la puerta y lo crea). Si el rechazo sigue, al agotar las
      // reanudaciones se cierra `failed` `transient_exhausted` (o recibe el
      // aviso `resume_exhausted`): nunca queda abierto para siempre.
      if (platformRejected) {
        logger.warn("Cobro automático: Stripe rechazó la petición de crear el cobro; el intento se reanudará otro día", {
          organizationId: attempt.organizationId,
          invoiceId: attempt.invoiceId,
          attemptId: attempt.id,
          errorName: stripeReadFailureOf(error).errorName,
          errorCode: finalCreateErrorCode(error),
        });
        countSkip(state, PLATFORM_INVALID_REQUEST_REASON);
        return null;
      }
      // Stripe se negó a crearlo por algo de la familia o de la academia que
      // no cambia al repetir (importe bajo el mínimo, cliente o método de pago
      // que ya no existen, tipo de pago no activo en la cuenta de la academia):
      // no se creó ningún cobro. Se cierra sin reintento y la cuota se cobra a
      // mano (C4).
      const finalCode = finalCreateErrorCode(error);
      if (finalCode !== null) {
        logger.warn("Cobro automático: Stripe rechazó crear el cobro; la cuota pasa a cobro manual", {
          organizationId: attempt.organizationId,
          invoiceId: attempt.invoiceId,
          attemptId: attempt.id,
          errorName: stripeReadFailureOf(error).errorName,
          errorCode: finalCode,
        });
        return apply(state, attempt, { kind: "canceled", paymentIntentId: null, reason: finalCode });
      }
      // Quizá se creó: la reanudación lo buscará por el id del intento.
      countSkip(state, "transient");
      return null;
    }
    // Un cobro creado rompe la racha. Si con él se llega a la proporción
    // (D9), este intento sigue su paso (confirmar); los siguientes, no.
    recordCreate(state, "created");
    if (
      !(await state.store.markCreated({
        organizationId: attempt.organizationId,
        attemptId: attempt.id,
        paymentIntentId: snapshot.id,
        now: state.now,
      }))
    ) {
      // Fase 4: un evento de Stripe de este mismo cobro pudo guardar el
      // `pi_…` a la vez (markCreated desde el evento). Si el intento ya lo
      // tiene, no es un cobro sin intento: se sigue si sigue `created`, y si
      // otro camino ya lo llevó más allá, se deja como está.
      const stored = await state.store.findAttemptByPaymentIntent({
        organizationId: attempt.organizationId,
        paymentIntentId: snapshot.id,
      });
      if (stored && stored.id === attempt.id) {
        if (stored.status !== "created") {
          countSkip(state, "concurrent");
          return null;
        }
        attempt = stored;
      } else {
        // El intento dejó de estar reclamado mientras se creaba el cobro.
        logger.error("Cobro automático: cobro creado para un intento que ya no estaba reclamado", undefined, {
          organizationId: attempt.organizationId,
          invoiceId: attempt.invoiceId,
          attemptId: attempt.id,
        });
        await notifyReview(state, attempt, "created_without_claim");
        return null;
      }
    } else {
      attempt = { ...attempt, status: "created", paymentIntentId: snapshot.id };
    }
  }

  // 3. Confirmar si todavía no se confirmó.
  let outcome = mapPaymentIntent(snapshot);
  if (outcome === "requires_confirmation") {
    if (!gateChecked) {
      const check = await recheckGate(state, attempt, refs);
      if (!check.allowed) {
        if (check.classification === "final") {
          return cancelThenClose(state, attempt, refs, { kind: "canceled", reason: check.reason });
        }
        if (lastChance) {
          return cancelThenClose(state, attempt, refs, {
            kind: "failed",
            code: TRANSIENT_EXHAUSTED_CODE,
            declineCode: null,
          });
        }
        countSkip(state, check.reason);
        return null;
      }
    }
    // El cobro de este intento: el único cuyo estado e importe cuentan.
    const ownPaymentIntentId = snapshot.id;
    try {
      const confirmed = await state.gateway.confirmPayment({
        connectedAccount,
        paymentIntentId: ownPaymentIntentId,
        attempt: { invoiceId: attempt.invoiceId, attemptNumber: attempt.attemptNumber },
        mandate: attempt.paymentMethodKind === "sepa_debit" ? refs.mandate : null,
      });
      outcome = mapPaymentIntent(confirmed);
      snapshot = "paymentIntent" in confirmed ? (confirmed.paymentIntent ?? snapshot) : confirmed;
    } catch (error) {
      // Si el error trae el cobro (p. ej. ya estaba cobrado), se usa ese: con
      // el de la creación, lo cobrado sería 0 y saldría un aviso falso de
      // importe que no cuadra. Solo si es el cobro de este intento (mismo id):
      // el de otro cobro no dice nada del de este, así que ni su estado ni su
      // importe cuentan; queda sin resultado (pasajero) y la reanudación vuelve
      // a leer el cobro de este intento. Nunca se registra con el de otro.
      const attached =
        typeof error === "object" && error !== null ? (error as { payment_intent?: unknown }).payment_intent : null;
      const adopted = snapshotOfPaymentIntent(attached);
      if (adopted && adopted.id !== ownPaymentIntentId) {
        outcome = "transient";
      } else {
        outcome = mapUnknownPaymentError(error);
        snapshot = adopted ?? snapshot;
      }
    }
  }

  // 4. Aplicar.
  return settleOutcome(state, attempt, refs, outcome, snapshot, { lastChance, allowCancel: true });
}
