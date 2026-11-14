/** Display only. Never determines entitlement, expiry or permission to write. */
export function formatSaasAccessDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date)} (hora de Madrid)`;
}

export function saasPaymentNotice(status: string): string | null {
  if (status === "past_due") {
    return "Hay un pago de tu suscripción sin resolver. Revisa el método de pago y las facturas en el portal. Un pago rechazado no cancela tu plan por sí solo.";
  }
  if (status === "unpaid") {
    return "El pago de tu suscripción sigue sin resolverse. Mira las facturas en el portal. No contrates el plan otra vez para resolverlo.";
  }
  return null;
}

export function resourceCapacityLabel(current: number, limit: number | null, excess: number): string | null {
  if (excess > 0) return `Excedente: ${excess}`;
  if (limit !== null && current === limit) return "Límite alcanzado";
  return null;
}
