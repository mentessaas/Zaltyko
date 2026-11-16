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
 * Orden de reglas (R10):
 * 1. Cuenta cerrada → `disabled` / `none`.
 * 2. Algún requisito de la academia vencido (`past_due`) → `onboarding` /
 *    `past_due`. Una cuenta v2 recién creada trae todos sus requisitos así y
 *    la tarjeta `restricted`: no es un problema, faltan los datos.
 * 3. Algún requisito de la academia exigible ya (`currently_due`) →
 *    `onboarding` / `user_action`.
 * 4. Algún requisito que espera a Stripe (`past_due` o `currently_due`) →
 *    `onboarding` / `stripe_review`.
 * 5. Tarjeta `active` → `active` / `none`.
 * 6. Tarjeta `restricted` o `unsupported` → `restricted` / `none`: un problema
 *    real, sin nada que la academia pueda rellenar.
 * 7. Si no → `onboarding` / `stripe_review` (Stripe revisando).
 * Los requisitos `eventually_due` nunca bastan por sí solos.
 */
export function projectConnectAccount(s: ConnectAccountSnapshot): ConnectAccountProjection {
  const cardPaymentsCapabilityStatus = capabilityOrPending(s.cardPaymentsStatus);
  const sepaDebitPaymentsCapabilityStatus = capabilityOrPending(s.sepaDebitPaymentsStatus);
  const capabilities = { cardPaymentsCapabilityStatus, sepaDebitPaymentsCapabilityStatus };

  if (s.closed) {
    return { status: "disabled", ...capabilities, requirementsState: "none" };
  }

  const blocking = s.requirementEntries.filter(
    (entry) => entry.deadlineStatus === "past_due" || entry.deadlineStatus === "currently_due"
  );
  const fromUser = blocking.filter((entry) => entry.awaitingActionFrom === "user");

  if (fromUser.some((entry) => entry.deadlineStatus === "past_due")) {
    return { status: "onboarding", ...capabilities, requirementsState: "past_due" };
  }
  if (fromUser.length > 0) {
    return { status: "onboarding", ...capabilities, requirementsState: "user_action" };
  }
  if (blocking.some((entry) => entry.awaitingActionFrom === "stripe")) {
    return { status: "onboarding", ...capabilities, requirementsState: "stripe_review" };
  }

  if (cardPaymentsCapabilityStatus === "active") {
    return { status: "active", ...capabilities, requirementsState: "none" };
  }
  if (
    cardPaymentsCapabilityStatus === "restricted" ||
    cardPaymentsCapabilityStatus === "unsupported"
  ) {
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
