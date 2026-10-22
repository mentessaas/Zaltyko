/**
 * Public labels for subscription lifecycle states.
 *
 * Stripe/database values remain stable and in English internally; every
 * customer-facing surface should resolve them through this map instead of
 * rendering the persisted status directly.
 */
const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  trialing: "En período de prueba",
  past_due: "Pago pendiente",
  canceling: "Cancelando",
  canceled: "Cancelado",
  cancelled: "Cancelado",
  incomplete: "Incompleto",
  incomplete_expired: "Expirado",
  unpaid: "Sin pagar",
  paused: "Pausado",
};

export function getSubscriptionStatusLabel(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  return (normalized && SUBSCRIPTION_STATUS_LABELS[normalized]) ?? "Estado no disponible";
}
