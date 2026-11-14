/** Known initial preconditions cannot erase a previously uncertain request. */
export function isDefinitiveSaasCommandRejection(
  response: { status: number }, payload: unknown, context: { previouslyUncertain?: boolean } = {},
): boolean {
  if (context.previouslyUncertain) return false;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const data = payload as Record<string, unknown>;
  if ("data" in data || data.type !== undefined || data.status !== undefined ||
    typeof data.message !== "string" || !data.message.trim()) return false;
  if (response.status === 429 && data.error === "RATE_LIMIT_EXCEEDED") {
    return data.ok === undefined && data.code === undefined;
  }
  if (data.ok !== false || typeof data.code !== "string" || data.error !== data.code
    || typeof data.message !== "string" || !data.message.trim()) return false;
  const allowed: Record<string, readonly number[]> = {
    UNAUTHENTICATED: [401], FORBIDDEN: [403], ORGANIZATION_NOT_FOUND: [404],
    VALIDATION_ERROR: [400, 422], PLAN_NOT_SELF_SERVE: [422],
    TRIAL_NOT_ELIGIBLE: [409], SUBSCRIPTION_ALREADY_EXISTS: [409],
    CHECKOUT_EXPIRED: [409, 410], RATE_LIMITED: [429],
    SAAS_TAX_TERRITORY_REQUIRED: [422], SAAS_TAX_TERRITORY_NOT_COVERED: [403],
    SAAS_IMMEDIATE_START_CONSENT_REQUIRED: [422],
    // Datos de factura rechazados antes de reservar nada: se corrigen y se envía otra solicitud.
    SAAS_BILLING_DETAILS_REQUIRED: [422], SAAS_BILLING_LEGAL_NAME_REQUIRED: [422],
    SAAS_BILLING_LEGAL_NAME_INVALID: [422], SAAS_BILLING_TAX_ID_REQUIRED: [422],
    SAAS_BILLING_TAX_ID_INVALID: [422],
  };
  return allowed[data.code]?.includes(response.status) ?? false;
}
