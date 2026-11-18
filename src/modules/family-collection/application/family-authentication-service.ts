/**
 * Cobro automático de cuotas (Fase 4, Tarea 5): la familia confirma con su
 * banco, desde /familia/cuotas, el cobro de tarjeta que espera en
 * `requires_action`. Es el MISMO cobro (el mismo `pi_…`) en la cuenta
 * conectada de la academia: nunca se crea otro ni se reintenta solo.
 *
 * - `startFamilyAuthentication`: devuelve lo justo para que el navegador
 *   confirme el cobro (`clientSecret`, `connectedAccount`, `paymentMethodId`).
 *   La clave se lee en Stripe en ese momento y nunca se guarda ni se registra.
 * - `checkFamilyAuthentication`: después de confirmar, relee el cobro en
 *   Stripe por el mismo camino que los eventos y la relectura diaria
 *   (`reconcileAttemptWithStripe` → `settleOutcome` → `applyOutcome`). Lo que
 *   diga el navegador nunca cuenta.
 *
 * Solo la persona pagadora vigente de la familia de esa factura, y solo si es
 * la persona del intento (la tarjeta que se cobra es la suya). A cualquier
 * otra cuenta, aunque sea de la misma familia, se le responde 404 sin decir
 * si hay un cobro. A la pagadora, 409 si el intento ya no espera, si su plazo
 * pasó o si Stripe ya no deja confirmarlo.
 *
 * Cerrojos (sin base): bandera del cobro, bandera de eventos, clave de prueba
 * y base que no es la de producción (`isFamilyPaymentConfirmationOpen`).
 * Después, el estado de una pasada en modo `"event"` con la recuperación de
 * la autenticación activa (almacenamiento con la forma "phase4"). Si falta
 * algo, 503 sin tocar Stripe.
 *
 * Stripe nunca dentro de una transacción. En el registro solo van ids y el
 * nombre de un error, nunca la clave del cobro.
 */
import { db } from "@/db";
import { isFamilyPaymentConfirmationOpen } from "@/modules/family-collection/application/config";
import {
  createRunState,
  type FamilyCollectionDeps,
} from "@/modules/family-collection/application/family-collection-service";
import { reconcileAttemptWithStripe } from "@/modules/family-collection/application/family-collection-reconcile";
import type { RunState } from "@/modules/family-collection/application/family-collection-steps";
import { isAuthenticationDeadlinePassed } from "@/modules/family-collection/domain/authentication-window";
import {
  readLatestAttemptForAcademy,
  type CollectionAttempt,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  retrievePaymentClientSecret,
  type PaymentConfirmationSecret,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { resolveFamilyPayer } from "@/modules/family-payment-methods/infrastructure/family-payment-store";
import { findConnectAccountForOrganization } from "@/modules/payments-connect/infrastructure/connect-account-store";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export interface FamilyAuthenticationInput {
  userId: string;
  organizationId: string;
  invoiceId: string;
  now?: Date;
}

export interface FamilyAuthenticationStart {
  clientSecret: string;
  connectedAccount: string;
  paymentMethodId: string;
}

export type FamilyAuthenticationState = "collected" | "processing" | "action_required" | "closed";

export interface FamilyAuthenticationDeps extends FamilyCollectionDeps {
  /** Lectura de la clave del cobro en Stripe (por defecto, retrievePaymentClientSecret). */
  readClientSecret?: (input: {
    connectedAccount: string;
    paymentIntentId: string;
  }) => Promise<PaymentConfirmationSecret>;
}

/** Estados de Stripe en los que la familia todavía puede confirmar el mismo cobro. */
const CONFIRMABLE_STATUSES: ReadonlySet<string> = new Set([
  "requires_payment_method",
  "requires_action",
  "requires_confirmation",
]);

export const FAMILY_PAYMENT_CONFIRMATION_CLOSED = "FAMILY_PAYMENT_CONFIRMATION_CLOSED";
export const FAMILY_PAYMENT_CONFIRMATION_EXPIRED = "FAMILY_PAYMENT_CONFIRMATION_EXPIRED";

function unavailableError(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "Ahora mismo no se puede confirmar el pago desde aquí. Si no lo confirmas a tiempo, tu academia te dirá cómo pagarla.",
    503
  );
}

function notFoundError(): OperationalError {
  // Igual para una cuota que no existe y para una que no paga esta cuenta.
  return new OperationalError("NOT_FOUND", "No encontramos este pago.", 404);
}

function closedError(): OperationalError {
  return new OperationalError(
    FAMILY_PAYMENT_CONFIRMATION_CLOSED,
    "Este pago ya no necesita que lo confirmes. Recarga la página para ver cómo está.",
    409
  );
}

function expiredError(): OperationalError {
  return new OperationalError(
    FAMILY_PAYMENT_CONFIRMATION_EXPIRED,
    "El plazo para confirmar este pago ya terminó. Tu academia te dirá cómo pagarla.",
    409
  );
}

/** Cerrojos y estado de una pasada en modo evento con la recuperación de la autenticación activa. */
async function openState(now: Date, deps: FamilyAuthenticationDeps): Promise<RunState> {
  // Solo entorno, sin base: en Live, contra producción o con una bandera apagada no se lee nada.
  if (!isFamilyPaymentConfirmationOpen()) throw unavailableError();
  const state = await createRunState({ now }, deps, "event");
  // authenticationRecovery exige las dos banderas y la forma "phase4".
  if (!state || !state.authenticationRecovery) throw unavailableError();
  return state;
}

/**
 * Último intento de la factura, solo si la cuenta es la persona pagadora
 * vigente de su familia en esa academia y la del intento. Si no, 404.
 */
async function payerAttempt(input: FamilyAuthenticationInput, now: Date): Promise<CollectionAttempt> {
  const attempt = await readLatestAttemptForAcademy({
    organizationId: input.organizationId,
    invoiceId: input.invoiceId,
  });
  if (!attempt) throw notFoundError();
  const payer = await resolveFamilyPayer(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    familyId: attempt.familyId,
    now,
  });
  if (!payer || attempt.familyPayerId === null || payer.familyPayerId !== attempt.familyPayerId) {
    throw notFoundError();
  }
  return attempt;
}

/**
 * Lo que necesita el navegador para que la familia confirme el cobro con su
 * banco. Solo para un intento de tarjeta en `requires_action`, antes de su
 * plazo, cuyo cobro Stripe aún deja confirmar, en la cuenta de prueba de la
 * academia y con la tarjeta de la autorización del intento.
 */
export async function startFamilyAuthentication(
  input: FamilyAuthenticationInput,
  deps: FamilyAuthenticationDeps = {}
): Promise<FamilyAuthenticationStart> {
  const now = input.now ?? new Date();
  const state = await openState(now, deps);
  const attempt = await payerAttempt(input, now);

  if (
    attempt.status !== "requires_action" ||
    attempt.paymentMethodKind !== "card" ||
    !attempt.paymentIntentId ||
    !attempt.paymentProviderAccountId
  ) {
    throw closedError();
  }
  const deadline = await state.store.readActionDeadline({
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
  });
  // Sin plazo es que otro camino lo acaba de mover.
  if (deadline === null) throw closedError();
  if (isAuthenticationDeadlinePassed(deadline, now)) throw expiredError();

  // La cuenta del intento tiene que ser la cuenta de prueba de la academia.
  const account = await findConnectAccountForOrganization(db, attempt.organizationId, "test");
  if (!account || account.environment !== "test" || account.id !== attempt.paymentProviderAccountId) {
    throw closedError();
  }
  const refs = await state.store.loadAttemptRefs(attempt);
  if (!refs || refs.connectedAccount !== account.providerAccountReference || !refs.paymentMethod) {
    throw closedError();
  }

  // Fuera de cualquier transacción.
  const read = deps.readClientSecret ?? ((target) => retrievePaymentClientSecret(target));
  const secret = await read({ connectedAccount: refs.connectedAccount, paymentIntentId: attempt.paymentIntentId });
  if (
    secret.id !== attempt.paymentIntentId ||
    secret.livemode ||
    secret.attemptIdFromMetadata !== attempt.id.toLowerCase() ||
    !CONFIRMABLE_STATUSES.has(secret.status) ||
    !secret.clientSecret ||
    (secret.paymentMethod !== null && secret.paymentMethod !== refs.paymentMethod)
  ) {
    throw closedError();
  }
  return {
    clientSecret: secret.clientSecret,
    connectedAccount: refs.connectedAccount,
    paymentMethodId: refs.paymentMethod,
  };
}

/** Lo que ve la familia según el estado del intento. Pura. */
export function familyAuthenticationStateOf(status: string): FamilyAuthenticationState {
  switch (status) {
    case "succeeded":
      return "collected";
    case "requires_action":
      return "action_required";
    case "claimed":
    case "created":
    case "processing":
      return "processing";
    default:
      return "closed";
  }
}

/**
 * Después de que la familia confirme en el navegador: relee el cobro en
 * Stripe por el mismo camino que los eventos (`reconcileAttemptWithStripe`) y
 * devuelve el estado que quedó en Zaltyko. Antes del plazo, un cobro que
 * Stripe aún no da por pagado sigue esperando; nunca se reintenta solo.
 */
export async function checkFamilyAuthentication(
  input: FamilyAuthenticationInput,
  deps: FamilyAuthenticationDeps = {}
): Promise<{ state: FamilyAuthenticationState }> {
  const now = input.now ?? new Date();
  const state = await openState(now, deps);
  const attempt = await payerAttempt(input, now);
  if (attempt.status !== "requires_action") return { state: familyAuthenticationStateOf(attempt.status) };

  // Si Stripe no deja leerlo, el error sigue hacia la ruta: el intento no cambia.
  await reconcileAttemptWithStripe(state, attempt);
  const after = await readLatestAttemptForAcademy({
    organizationId: input.organizationId,
    invoiceId: input.invoiceId,
  });
  // Solo el mismo intento: es el que la familia acaba de confirmar.
  if (!after || after.id !== attempt.id) return { state: "processing" };
  return { state: familyAuthenticationStateOf(after.status) };
}
