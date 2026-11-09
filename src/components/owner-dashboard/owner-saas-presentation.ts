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
    return "Hay un pago pendiente de la suscripción. Revisa el método de pago y las facturas en el Portal. Un intento rechazado no confirma por sí solo la cancelación: el acceso efectivo es el que indica el servidor.";
  }
  if (status === "unpaid") {
    return "El pago de la suscripción sigue sin resolverse. Consulta las facturas en el Portal. El acceso efectivo y los límites son los que confirma el servidor; no repitas una contratación para intentar resolver este pago.";
  }
  return null;
}

export function resourceCapacityLabel(current: number, limit: number | null, excess: number): string | null {
  if (excess > 0) return `Excedente: ${excess}`;
  if (limit !== null && current === limit) return "Límite alcanzado";
  return null;
}
