/**
 * Cobro automático de cuotas (Fase 4): lo común a las devoluciones y a las
 * disputas cuando ningún intento tiene guardado el `pi_…` del cargo, ni
 * siquiera después de pasar por el camino de los cobros (`recordCollection`).
 *
 * ¿Es un cobro que creó el cobro automático de Zaltyko y que el camino de los
 * cobros todavía puede adoptar? Se relee el `pi_…` en la cuenta conectada y se
 * mira el id del intento de su metadata (el evento nunca se cree). Solo es
 * «adoptable» si ese intento existe en esta academia, sigue `claimed` y es de
 * esta cuenta conectada: el mismo criterio que la adopción del camino de los
 * cobros (findClaimedAttemptById). Entonces quien llama pide a Stripe que
 * reenvíe el evento (error pasajero) en vez de perder la devolución o la
 * disputa.
 *
 * Si no es de Zaltyko: false sin aviso (la academia cobra otras cosas en su
 * cuenta; no es asunto de este módulo). Si es de Zaltyko pero ya no está
 * `claimed` o es de otra cuenta, un reenvío nunca lo adoptaría (el evento
 * fallaría unos 3 días sin registrar nada): false y un aviso en el registro
 * con solo ids. Un error permanente de Stripe al releer da false (aviso con
 * solo ids y el código); uno pasajero sube. Nunca dentro de una transacción.
 */
import { logger } from "@/lib/logger";
import { stripeReadFailureOf } from "@/modules/family-collection/domain/stripe-read-error";
import type { CollectionAttempt } from "@/modules/family-collection/infrastructure/family-collection-store";
import type { StoredConnectAccount } from "@/modules/payments-connect/infrastructure/connect-account-store";

/** Lectura en Stripe del id del intento de la metadata de un `pi_…` (opcional para las dobles de los tests). */
export interface PaymentIntentAttemptIdReader {
  retrievePaymentIntentAttemptId?(input: { connectedAccount: string; paymentIntentId: string }): Promise<string | null>;
}

/** El intento de esa academia con ese id, solo si sigue `claimed` (opcional para las dobles de los tests). */
export interface ClaimedAttemptFinder {
  findClaimedAttemptById?(input: { organizationId: string; attemptId: string }): Promise<CollectionAttempt | null>;
}

export interface AdoptableCollectionInput {
  organizationId: string;
  account: StoredConnectAccount;
  paymentIntentId: string;
  /** Qué trajo el evento, para el texto del aviso: «devolución» o «disputa». */
  subject: "devolución" | "disputa";
  /** Solo ids del evento para el registro. */
  logIds: Record<string, unknown>;
}

export async function isAdoptableZaltykoCollection(
  input: AdoptableCollectionInput,
  deps: { gateway: PaymentIntentAttemptIdReader; store: ClaimedAttemptFinder }
): Promise<boolean> {
  const { gateway, store } = deps;
  // Sin la lectura o sin la búsqueda (dobles de los tests): sin efecto, como antes.
  if (!gateway.retrievePaymentIntentAttemptId || !store.findClaimedAttemptById) return false;

  let attemptId: string | null;
  try {
    attemptId =
      (await gateway.retrievePaymentIntentAttemptId({
        connectedAccount: input.account.providerAccountReference,
        paymentIntentId: input.paymentIntentId,
      })) ?? null;
  } catch (error) {
    const failure = stripeReadFailureOf(error);
    if (!failure.permanent) throw error;
    logger.warn(`Cobro automático: Stripe no deja leer el cobro de una ${input.subject} de un evento`, {
      ...input.logIds,
      paymentIntentId: input.paymentIntentId,
      errorName: failure.errorName,
      errorCode: failure.errorCode,
    });
    return false;
  }
  // Un cobro que no creó Zaltyko: no es asunto de este módulo.
  if (attemptId === null) return false;

  const claimed = await store.findClaimedAttemptById({ organizationId: input.organizationId, attemptId });
  if (!claimed || claimed.paymentProviderAccountId !== input.account.id) {
    logger.warn(
      `Cobro automático: ${input.subject} de un cobro de Zaltyko sin intento reclamado que adoptar en esta cuenta; no se aplica`,
      {
        ...input.logIds,
        paymentIntentId: input.paymentIntentId,
        attemptId,
        reason: claimed ? "other_connected_account" : "attempt_not_claimed",
      }
    );
    return false;
  }
  return true;
}
