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
 *   (o, si nunca se creó, sin haberlo buscado);
 * - un cobro que el banco dejó pendiente de autenticación se cancela antes de
 *   darlo por fallido, para que no pueda completarse después;
 * - antes de crear o confirmar al reanudar, se repite la puerta completa:
 *   nunca se cobra a quien ya no paga.
 */
import { logger } from "@/lib/logger";
import {
  ACCOUNT_FRESHNESS_MS,
  evaluateFamilyCollectionGate,
  type FamilyCollectionGateClassification,
  type FamilyCollectionGateInput,
} from "@/modules/family-collection/domain/collection-gate";
import {
  localCalendarDate,
  planInvoiceCollection,
  type CollectionPlan,
} from "@/modules/family-collection/domain/collection-plan";
import {
  isAuthenticationRequiredFailure,
  mapPaymentIntent,
  mapUnknownPaymentError,
  type PaymentFailure,
  type PaymentIntentSnapshot,
  type PaymentOutcome,
} from "@/modules/family-collection/domain/payment-outcome";
import { nextRetry } from "@/modules/family-collection/domain/retry-policy";
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
  store: FamilyCollectionStore;
  gateway: FamilyCollectionGateway;
  /** Academias a recorrer; `null` = todas (producción). Solo los tests lo limitan. */
  scope: OrganizationScope;
  refreshAccount: (accountRowId: string) => Promise<unknown>;
  /** Academias cuya cuenta ya se releyó en esta ejecución (una vez por academia). */
  refreshedOrganizations: Set<string>;
  result: FamilyCollectionRunResult;
}

export function isExpired(state: RunState): boolean {
  return Date.now() >= state.deadline;
}

export function countSkip(state: RunState, reason: string): void {
  state.result.skipped[reason] = (state.result.skipped[reason] ?? 0) + 1;
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
  if (!gate.allowed) return gate;
  if (
    context.authorization?.id !== attempt.authorizationId ||
    context.account?.id !== attempt.paymentProviderAccountId ||
    gate.paymentMethodKind !== attempt.paymentMethodKind
  ) {
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

type Close =
  | { kind: "failed"; code: string; declineCode: string | null }
  | { kind: "canceled"; reason: string };

/**
 * Cancela en Stripe el cobro del intento y, solo si Stripe confirma la
 * cancelación, cierra el intento. Si Stripe ya no deja cancelarlo, se relee y
 * se aplica lo que diga (un cobro hecho nunca queda como fallido).
 */
async function cancelThenClose(
  state: RunState,
  attempt: CollectionAttempt,
  refs: AttemptStripeRefs,
  close: Close
): Promise<FamilyCollectionAttemptStatus | null> {
  const paymentIntentId = attempt.paymentIntentId;
  if (!paymentIntentId) throw new Error("FAMILY_COLLECTION_INTENT_REQUIRED");
  let canceled: "canceled" | "not_cancelable";
  try {
    canceled = await state.gateway.cancelPayment({ connectedAccount: refs.connectedAccount, paymentIntentId });
  } catch {
    countSkip(state, "transient");
    return null;
  }
  if (canceled === "canceled") {
    return apply(
      state,
      attempt,
      close.kind === "failed"
        ? { kind: "failed", paymentIntentId, code: close.code, declineCode: close.declineCode, nextRetryAt: null }
        : { kind: "canceled", paymentIntentId, reason: close.reason }
    );
  }
  let snapshot: PaymentIntentSnapshot;
  try {
    snapshot = await state.gateway.retrievePayment({ connectedAccount: refs.connectedAccount, paymentIntentId });
  } catch {
    countSkip(state, "transient");
    return null;
  }
  const outcome = mapPaymentIntent(snapshot);
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
 * - sin resultado: el intento se queda como está; en su última reanudación se
 *   cancela en Stripe y se cierra;
 * - conflicto de idempotencia: se queda como está, con aviso.
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

  if (outcome === "succeeded") return apply(state, attempt, { kind: "succeeded", paymentIntentId });

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

  if (isFailedOutcome(outcome)) {
    const failure = outcome.failed;
    const awaitingAction = snapshot?.status === "requires_action";
    const nextRetryAt =
      attempt.paymentMethodKind === null
        ? null
        : nextRetry({
            kind: attempt.paymentMethodKind,
            attemptNumber: attempt.attemptNumber,
            code: failure.code,
            declineCode: failure.declineCode,
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
        await reportIdempotencyConflict(state, attempt);
        return null;
      }
      // Quizá se creó: la reanudación lo buscará por el id del intento.
      countSkip(state, "transient");
      return null;
    }
    if (
      !(await state.store.markCreated({
        organizationId: attempt.organizationId,
        attemptId: attempt.id,
        paymentIntentId: snapshot.id,
        now: state.now,
      }))
    ) {
      // El intento dejó de estar reclamado mientras se creaba el cobro.
      logger.error("Cobro automático: cobro creado para un intento que ya no estaba reclamado", undefined, {
        organizationId: attempt.organizationId,
        invoiceId: attempt.invoiceId,
        attemptId: attempt.id,
      });
      await notifyReview(state, attempt, "created_without_claim");
      return null;
    }
    attempt = { ...attempt, status: "created", paymentIntentId: snapshot.id };
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
    try {
      const confirmed = await state.gateway.confirmPayment({
        connectedAccount,
        paymentIntentId: snapshot.id,
        attempt: { invoiceId: attempt.invoiceId, attemptNumber: attempt.attemptNumber },
        mandate: attempt.paymentMethodKind === "sepa_debit" ? refs.mandate : null,
      });
      outcome = mapPaymentIntent(confirmed);
      snapshot = "paymentIntent" in confirmed ? (confirmed.paymentIntent ?? snapshot) : confirmed;
    } catch (error) {
      outcome = mapUnknownPaymentError(error);
    }
  }

  // 4. Aplicar.
  return settleOutcome(state, attempt, refs, outcome, snapshot, { lastChance, allowCancel: true });
}
