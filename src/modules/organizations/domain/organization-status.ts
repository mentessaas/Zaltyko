/**
 * Estado de una academia (zaltyko.organizations.status, enum
 * `organization_status`).
 *
 * Toda academia nace `trial` (valor por defecto de la migración base) y nada
 * en el código la pasa a `active`: las dos son academias que funcionan con
 * normalidad. Por eso la academia «operativa» es la que está en prueba o
 * activa; no lo son las suspendidas ni las cerradas.
 *
 * Lo usan el cobro automático de cuotas (emisión, puerta del cobro, avisos y
 * métodos de pago de la familia) y los recordatorios de pago. Función pura:
 * sin base ni variables de entorno. En SQL, construir la lista desde
 * OPERATING_ORGANIZATION_STATUSES con parámetros (nunca texto libre).
 */
export const ORGANIZATION_STATUSES = ["trial", "active", "suspended", "closed"] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/** Academia operativa: en prueba o activa (no suspendida ni cerrada). */
export const OPERATING_ORGANIZATION_STATUSES = ["trial", "active"] as const satisfies readonly OrganizationStatus[];

export type OperatingOrganizationStatus = (typeof OPERATING_ORGANIZATION_STATUSES)[number];

/**
 * ¿La academia está operativa (en prueba o activa)? Cualquier otro valor,
 * también uno desconocido o vacío, responde `false`.
 */
export function isOperatingOrganizationStatus(status: unknown): status is OperatingOrganizationStatus {
  return typeof status === "string" && (OPERATING_ORGANIZATION_STATUSES as readonly string[]).includes(status);
}
