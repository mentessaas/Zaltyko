import type { PaymentMethodKind } from "./consent";

/**
 * Pago automático de cuotas (cobro automático, Fase 2): comprobación de la
 * preparación que devuelve Stripe al terminar. Función pura: nunca confía en
 * lo que manda el navegador; compara lo que Stripe dice con el intento que
 * Zaltyko guardó al empezar.
 *
 * Solo se manejan referencias opacas (seti_…, cus_…, pm_…, mandate_…).
 */
export interface SetupIntentSnapshot {
  id: string;
  status: string;
  customer: string | null;
  paymentMethod: string | null;
  paymentMethodType: string | null;
  mandate: string | null;
  /** metadata.zaltyko_setup_attempt_id del SetupIntent. */
  metadataAttemptId: string | null;
  /**
   * Stripe guarda un error del último intento (por ejemplo, el banco rechazó
   * la confirmación 3DS). Solo si existe; nunca su contenido.
   */
  hasLastSetupError: boolean;
}

export type SetupVerificationOutcome =
  | { outcome: "succeeded"; paymentMethodReference: string; mandateReference: string | null }
  | { outcome: "pending" }
  | { outcome: "failed" }
  | { outcome: "mismatch" };

export function verifyCompletedSetupIntent(
  expected: { attemptId: string; customerReference: string; kind: PaymentMethodKind },
  setupIntent: SetupIntentSnapshot
): SetupVerificationOutcome {
  // Primero, que sea de verdad la preparación de este intento y este cliente.
  if (setupIntent.customer !== expected.customerReference) return { outcome: "mismatch" };
  if (setupIntent.metadataAttemptId !== expected.attemptId) return { outcome: "mismatch" };
  // Si Stripe ya conoce el tipo de método, tiene que ser el elegido.
  if (setupIntent.paymentMethodType !== null && setupIntent.paymentMethodType !== expected.kind) {
    return { outcome: "mismatch" };
  }

  if (setupIntent.status === "succeeded") {
    if (setupIntent.paymentMethod === null) return { outcome: "mismatch" };
    if (setupIntent.paymentMethodType !== expected.kind) return { outcome: "mismatch" };
    // La domiciliación sin orden firmada no sirve para cobrar.
    if (expected.kind === "sepa_debit" && setupIntent.mandate === null) {
      return { outcome: "mismatch" };
    }
    return {
      outcome: "succeeded",
      paymentMethodReference: setupIntent.paymentMethod,
      mandateReference: setupIntent.mandate,
    };
  }
  if (setupIntent.status === "canceled") return { outcome: "failed" };
  // Vuelve a pedir método porque el último intento falló (3DS o banco que
  // rechaza): no es «pendiente», la familia tiene que volver a guardarlo.
  if (setupIntent.status === "requires_payment_method" && setupIntent.hasLastSetupError) {
    return { outcome: "failed" };
  }
  // processing, requires_action, requires_confirmation y
  // requires_payment_method sin error: Stripe todavía espera al banco, al 3DS
  // o a la familia. Un estado nuevo que no conocemos se trata igual: no se
  // escribe nada y la familia puede volver a intentarlo.
  return { outcome: "pending" };
}
