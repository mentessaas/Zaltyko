/**
 * Conectar Stripe (cobro automático, Fase 1): proyección pura del estado de la
 * cuenta conectada de la academia a partir de la cuenta v2 de Stripe.
 *
 * Sin E/S: el adaptador (Tarea 4) lee la cuenta v2 y entrega solo lo mínimo en
 * un `ConnectAccountSnapshot`; aquí se decide qué estado y qué tipo de
 * requisitos pendientes guarda Zaltyko. El estado `pending` del enum de base no
 * se produce nunca: la fila nace en `onboarding` (Tarea 5).
 */

export type RequirementsState = "none" | "user_action" | "stripe_review" | "past_due";

export interface ConnectAccountSnapshot {
  id: string;
  closed: boolean;
  /** configuration.merchant.capabilities.card_payments.status */
  cardPaymentsStatus: string | null;
  /** configuration.merchant.capabilities.sepa_debit_payments.status */
  sepaDebitPaymentsStatus: string | null;
  requirementEntries: Array<{
    deadlineStatus: "currently_due" | "past_due" | "eventually_due";
    awaitingActionFrom: "user" | "stripe";
  }>;
}

export interface ConnectAccountProjection {
  status: "onboarding" | "restricted" | "active" | "disabled";
  /** `null` se proyecta como `"pending"`. */
  cardPaymentsCapabilityStatus: string;
  /** `null` se proyecta como `"pending"`. */
  sepaDebitPaymentsCapabilityStatus: string;
  requirementsState: RequirementsState;
}

function capabilityOrPending(status: string | null): string {
  return status ?? "pending";
}

/**
 * Orden de reglas: cuenta cerrada → algún requisito vencido (`past_due`) →
 * requisitos exigibles ya (`currently_due`, primero los que esperan a la
 * academia y luego los que esperan a Stripe) → estado de la capacidad de
 * tarjeta. Los requisitos `eventually_due` nunca bastan por sí solos para
 * sacar la cuenta de `active`.
 */
export function projectConnectAccount(s: ConnectAccountSnapshot): ConnectAccountProjection {
  const cardPaymentsCapabilityStatus = capabilityOrPending(s.cardPaymentsStatus);
  const sepaDebitPaymentsCapabilityStatus = capabilityOrPending(s.sepaDebitPaymentsStatus);
  const capabilities = { cardPaymentsCapabilityStatus, sepaDebitPaymentsCapabilityStatus };

  if (s.closed) {
    return { status: "disabled", ...capabilities, requirementsState: "none" };
  }

  if (s.requirementEntries.some((entry) => entry.deadlineStatus === "past_due")) {
    return { status: "restricted", ...capabilities, requirementsState: "past_due" };
  }

  const currentlyDue = s.requirementEntries.filter(
    (entry) => entry.deadlineStatus === "currently_due"
  );
  if (currentlyDue.some((entry) => entry.awaitingActionFrom === "user")) {
    return { status: "onboarding", ...capabilities, requirementsState: "user_action" };
  }
  if (currentlyDue.length > 0) {
    return { status: "onboarding", ...capabilities, requirementsState: "stripe_review" };
  }

  if (cardPaymentsCapabilityStatus === "active") {
    return { status: "active", ...capabilities, requirementsState: "none" };
  }
  if (cardPaymentsCapabilityStatus === "restricted") {
    return { status: "restricted", ...capabilities, requirementsState: "none" };
  }

  // Sin requisitos exigibles y tarjeta aún sin decidir (p. ej. `pending`):
  // Stripe está revisando la cuenta.
  return { status: "onboarding", ...capabilities, requirementsState: "stripe_review" };
}

/** `true` si cambia cualquiera de los campos que guarda Zaltyko. */
export function projectionChanged(
  a: ConnectAccountProjection,
  b: ConnectAccountProjection
): boolean {
  return (
    a.status !== b.status ||
    a.cardPaymentsCapabilityStatus !== b.cardPaymentsCapabilityStatus ||
    a.sepaDebitPaymentsCapabilityStatus !== b.sepaDebitPaymentsCapabilityStatus ||
    a.requirementsState !== b.requirementsState
  );
}
