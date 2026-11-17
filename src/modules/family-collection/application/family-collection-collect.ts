/**
 * Cobro automático de cuotas (Fase 3), Fase B del proceso diario: cobrar lo
 * que vence hoy.
 *
 * Por cada factura candidata: recarga sin transacción (cuenta conectada
 * releída si hace falta), plan del cobro y puerta completa. Un motivo
 * pasajero no escribe nada (se vuelve a mirar mañana); uno final escribe un
 * intento `canceled` y la cuota vuelve a manual y a los recordatorios. Si la
 * puerta deja pasar, se reclama el intento (transacción corta que repite el
 * plan con los datos bloqueados) y después se crea y confirma en Stripe.
 *
 * Ventana máxima de cobro: pasada la espera de los recordatorios
 * (AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS días después de la fecha de cobro,
 * o de la del reintento) la cuota ya volvió a los recordatorios y la familia
 * puede haberla pagado a mano. Entonces nunca se cobra: se escribe un intento
 * `canceled` con `collection_window_expired`, aunque la puerta deje pasar.
 */
import { collectionDate, localCalendarDate } from "@/modules/family-collection/domain/collection-plan";
import { evaluateFamilyCollectionGate } from "@/modules/family-collection/domain/collection-gate";
import {
  advanceAttempt,
  buildGateInput,
  countSkip,
  earliestServicePeriod,
  INVALID_SERVICE_PERIOD_CODE,
  isExpired,
  isValidServicePeriod,
  logStepFailure,
  loadFreshContext,
  notifyStepError,
  planFor,
  type RunState,
} from "@/modules/family-collection/application/family-collection-steps";
import type {
  AttemptHistory,
  ClaimDecision,
  CollectionAllocationRow,
  CollectionAttempt,
  CollectionChargeRow,
  DueInvoiceRef,
  LockedInvoiceSnapshot,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  COLLECTION_WINDOW_EXPIRED_CODE,
  FAMILY_COLLECTION_MAX_ATTEMPTS_PER_INVOICE,
} from "@/modules/family-collection/infrastructure/family-collection-schema";
import { withinGrace } from "@/modules/payment-reminders/domain/reminder-policy";

/** Margen del filtro grueso de la base; la fecha local exacta la decide el plan. */
const SELECTION_HORIZON_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * ¿Impide el historial un intento nuevo hoy? Solo si no hay intento abierto y
 * el último no es final, o es un fallo con reintento cuya fecha LOCAL ya llegó
 * (comparar fechas locales evita perder un día en zonas al oeste de UTC).
 */
export function historyBlock(history: AttemptHistory, timezone: string, todayLocal: string): string | null {
  if (history.openExists) return "concurrent";
  const last = history.last;
  if (!last) return null;
  if (last.status === "failed" && last.nextRetryAt) {
    return localCalendarDate(last.nextRetryAt, timezone) <= todayLocal ? null : "retry_not_due";
  }
  return "already_final";
}

/**
 * ¿Pasó ya la ventana máxima de cobro de la factura? Misma espera y misma
 * función (`withinGrace`) que los recordatorios (reminder-policy.ts), para
 * que nunca se cobre una cuota que ya volvió a ellos:
 * - sin intentos: desde la fecha de cobro de la cuota más antigua del reparto;
 * - con un reintento pendiente: desde la fecha local del reintento.
 *
 * Todas las cuotas de una factura mensual comparten vencimiento
 * (monthly-invoice/issue.ts pasa un único `dueAt` a issueInvoiceInTransaction,
 * que lo copia en cada cuota), así que la más antigua es la de todas; se toma
 * la más antigua por si una cuota cambiara de fecha después.
 */
export function collectionWindowExpired(input: {
  history: AttemptHistory;
  charges: readonly CollectionChargeRow[];
  allocations: readonly CollectionAllocationRow[];
  timezone: string;
  collectionDayOfMonth: number | null;
  todayLocal: string;
}): boolean {
  const last = input.history.last;
  if (last) {
    // historyBlock ya descartó todo lo que no es un fallo con reintento.
    if (last.status !== "failed" || !last.nextRetryAt) return false;
    return !withinGrace(localCalendarDate(last.nextRetryAt, input.timezone), input.todayLocal);
  }
  const planned = new Set(input.allocations.map((allocation) => allocation.chargeId));
  const earliest = input.charges
    .filter((charge) => planned.has(charge.id))
    .map((charge) =>
      collectionDate({
        dueDateLocal: localCalendarDate(charge.dueAt, input.timezone),
        collectionDayOfMonth: input.collectionDayOfMonth,
      })
    )
    .sort()[0];
  return earliest !== undefined && !withinGrace(earliest, input.todayLocal);
}

function sameAllocations(left: readonly CollectionAllocationRow[], right: readonly CollectionAllocationRow[]): boolean {
  if (left.length !== right.length) return false;
  const byCharge = new Map(right.map((allocation) => [allocation.chargeId, allocation.amountCents]));
  return left.every((allocation) => byCharge.get(allocation.chargeId) === allocation.amountCents);
}

/**
 * Decisión pura dentro de la transacción de reclamar o cancelar: repite el
 * historial, el plan y la ventana máxima de cobro con los datos bloqueados, y
 * en `claimed` comprueba que cada cuota es del pagador de la factura y que la
 * autorización sigue activa y es de ese pagador, esa familia y esa cuenta.
 * Con la ventana pasada nunca reclama: cancela con `collection_window_expired`.
 */
export function decideClaim(
  snapshot: LockedInvoiceSnapshot,
  expected: {
    action: "claimed" | "canceled";
    reason?: string;
    lastAttemptNumber: number;
    allocations: readonly CollectionAllocationRow[];
    todayLocal: string;
    collectionDayOfMonth: number | null;
    authorizationId: string | null;
    paymentProviderAccountId: string | null;
  }
): ClaimDecision {
  const invoice = snapshot.invoice;
  // Otro proceso escribió un intento entre la lectura y el bloqueo.
  if ((snapshot.history.last?.attemptNumber ?? 0) !== expected.lastAttemptNumber) {
    return { action: "skip", reason: "concurrent" };
  }
  const blocked = historyBlock(snapshot.history, invoice.timezone, expected.todayLocal);
  if (blocked) return { action: "skip", reason: blocked };
  const attemptNumber = expected.lastAttemptNumber + 1;
  if (attemptNumber > FAMILY_COLLECTION_MAX_ATTEMPTS_PER_INVOICE) {
    return { action: "skip", reason: "attempts_exhausted" };
  }
  const plan = planFor(invoice, snapshot.charges, expected.todayLocal, expected.collectionDayOfMonth);
  if (!plan.collect) return { action: "skip", reason: plan.reason };
  if (!sameAllocations(plan.allocations, expected.allocations)) return { action: "skip", reason: "plan_changed" };

  const expired = collectionWindowExpired({
    history: snapshot.history,
    charges: snapshot.charges,
    allocations: plan.allocations,
    timezone: invoice.timezone,
    collectionDayOfMonth: expected.collectionDayOfMonth,
    todayLocal: expected.todayLocal,
  });
  if (expired) {
    return {
      action: "canceled",
      attemptNumber,
      amountCents: plan.amountCents,
      allocations: plan.allocations,
      reason: COLLECTION_WINDOW_EXPIRED_CODE,
    };
  }
  // Fuera se vio la ventana pasada y dentro no: los datos cambiaron; mañana se mira otra vez.
  if (expected.action === "canceled" && expected.reason === COLLECTION_WINDOW_EXPIRED_CODE) {
    return { action: "skip", reason: "plan_changed" };
  }

  if (expected.action === "claimed") {
    const charges = new Map(snapshot.charges.map((charge) => [charge.id, charge]));
    const foreign = plan.allocations.some((allocation) => {
      const charge = charges.get(allocation.chargeId);
      return (
        !charge ||
        charge.invoiceId !== invoice.id ||
        charge.organizationId !== invoice.organizationId ||
        charge.familyId !== invoice.familyId ||
        charge.familyPayerId === null ||
        charge.familyPayerId !== invoice.familyPayerId
      );
    });
    if (foreign) return { action: "skip", reason: "plan_changed" };
    const authorization = snapshot.authorization;
    if (
      !authorization ||
      authorization.id !== expected.authorizationId ||
      authorization.status !== "active" ||
      authorization.organizationId !== invoice.organizationId ||
      authorization.familyId !== invoice.familyId ||
      authorization.familyPayerId !== invoice.familyPayerId ||
      authorization.paymentProviderAccountId !== expected.paymentProviderAccountId
    ) {
      return { action: "skip", reason: "authorization_changed" };
    }
  }
  return {
    action: expected.action,
    attemptNumber,
    amountCents: plan.amountCents,
    allocations: plan.allocations,
    ...(expected.action === "canceled" ? { reason: expected.reason } : {}),
  };
}

/** Aviso único de la factura que ya no admite más intentos; la cuota se cobra a mano. */
async function notifyAttemptsExhausted(
  state: RunState,
  invoice: { id: string; organizationId: string; locationId: string }
): Promise<void> {
  countSkip(state, "attempts_exhausted");
  const written = await state.store.recordNotice({
    organizationId: invoice.organizationId,
    locationId: invoice.locationId,
    attemptId: null,
    invoiceId: invoice.id,
    reason: "attempts_exhausted",
    now: state.now,
  });
  if (written) state.result.needsReview += 1;
}

async function collectInvoice(state: RunState, ref: DueInvoiceRef): Promise<void> {
  const context = await loadFreshContext(state, ref.organizationId, ref.invoiceId);
  if (!context) {
    countSkip(state, "invoice_missing");
    return;
  }
  const invoice = context.invoice;
  const todayLocal = localCalendarDate(state.now, invoice.timezone);
  const blocked = historyBlock(context.history, invoice.timezone, todayLocal);
  if (blocked) {
    countSkip(state, blocked);
    return;
  }
  // Sin más números de intento (hoy inalcanzable: un solo reintento). Nunca
  // en silencio: la academia recibe un aviso de la factura, una sola vez.
  if ((context.history.last?.attemptNumber ?? 0) >= FAMILY_COLLECTION_MAX_ATTEMPTS_PER_INVOICE) {
    await notifyAttemptsExhausted(state, invoice);
    return;
  }
  const plan = planFor(invoice, context.charges, todayLocal, context.collectionDayOfMonth);
  if (!plan.collect) {
    countSkip(state, plan.reason);
    return;
  }

  const allocations = plan.allocations;
  // Ventana máxima: la cuota ya volvió a los recordatorios; nunca se cobra.
  const expired = collectionWindowExpired({
    history: context.history,
    charges: context.charges,
    allocations,
    timezone: invoice.timezone,
    collectionDayOfMonth: context.collectionDayOfMonth,
    todayLocal,
  });
  // La puerta corta antes de reclamar nada.
  const planned = new Set(allocations.map((allocation) => allocation.chargeId));
  const gate = evaluateFamilyCollectionGate(
    buildGateInput(
      state,
      context,
      context.charges.filter((charge) => planned.has(charge.id)),
      todayLocal
    )
  );
  if (!expired && !gate.allowed && gate.classification === "transient") {
    countSkip(state, gate.reason);
    return;
  }

  // Sin un periodo válido no hay con qué describir el cobro: se cierra con
  // un motivo propio, antes de reclamar y sin gastar reanudaciones.
  const periodValid = isValidServicePeriod(
    earliestServicePeriod(context.charges.filter((charge) => planned.has(charge.id)))
  );
  const claim =
    !expired && gate.allowed && periodValid
      ? {
          action: "claimed" as const,
          authorizationId: context.authorization?.id ?? null,
          paymentProviderAccountId: context.account?.id ?? null,
          paymentMethodKind: gate.paymentMethodKind,
        }
      : {
          action: "canceled" as const,
          reason: expired
            ? COLLECTION_WINDOW_EXPIRED_CODE
            : gate.allowed
              ? INVALID_SERVICE_PERIOD_CODE
              : gate.reason,
          authorizationId: null,
          paymentProviderAccountId: null,
          paymentMethodKind: null,
        };
  const result = await state.store.claimOrCancel(
    {
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      authorizationId: claim.authorizationId,
      paymentProviderAccountId: claim.paymentProviderAccountId,
      paymentMethodKind: claim.paymentMethodKind,
      now: state.now,
    },
    (snapshot) =>
      decideClaim(snapshot, {
        action: claim.action,
        reason: claim.action === "canceled" ? claim.reason : undefined,
        lastAttemptNumber: context.history.last?.attemptNumber ?? 0,
        allocations,
        todayLocal,
        collectionDayOfMonth: context.collectionDayOfMonth,
        authorizationId: claim.authorizationId,
        paymentProviderAccountId: claim.paymentProviderAccountId,
      })
  );

  if (result.outcome === "skipped") {
    if (result.reason === "attempts_exhausted") {
      await notifyAttemptsExhausted(state, invoice);
      return;
    }
    countSkip(state, result.reason);
    return;
  }
  if (result.outcome === "canceled") {
    state.result.canceled += 1;
    return;
  }
  if (result.attempt.attemptNumber > 1) state.result.retried += 1;
  await advanceClaimed(state, result.attempt);
}

async function advanceClaimed(state: RunState, attempt: CollectionAttempt): Promise<void> {
  try {
    await advanceAttempt(state, attempt, { phase: "collect" });
  } catch (error) {
    // El intento se queda reclamado o creado: lo reanuda la Fase A otro día.
    logStepFailure("Cobro automático: falló un paso del cobro", error, {
      organizationId: attempt.organizationId,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
    });
    countSkip(state, "error");
    await notifyStepError(state, attempt, error).catch(() => undefined);
  }
}

/** Recorre las facturas candidatas por orden de id hasta acabar o agotar el plazo. */
export async function collectDueInvoices(state: RunState): Promise<void> {
  const horizon = new Date(state.now.getTime() + SELECTION_HORIZON_MS);
  let cursor: string | null = null;
  for (;;) {
    if (isExpired(state)) {
      state.result.complete = false;
      return;
    }
    const page = await state.store.listDueInvoices({
      after: cursor,
      limit: state.batchSize,
      horizon,
      scope: state.scope,
    });
    for (const ref of page) {
      if (isExpired(state)) {
        state.result.complete = false;
        return;
      }
      cursor = ref.invoiceId;
      try {
        await collectInvoice(state, ref);
      } catch (error) {
        // Una factura con problemas no frena a las demás.
        logStepFailure("Cobro automático: falló el cobro de una factura", error, {
          organizationId: ref.organizationId,
          invoiceId: ref.invoiceId,
        });
        countSkip(state, "error");
      }
    }
    if (page.length < state.batchSize) return;
  }
}
