/**
 * Input validation: UUIDs, request id, idempotency key and the normalized
 * reason (20 to 1000 code points).
 */
import { fail } from "./errors";
import type { ConfirmSaasReconciliationInput } from "./model";

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw fail("VERSION_CONFLICT", `${label} no es válido`, 400);
  }
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function validateRequestId(requestId: string): void {
  if (!requestId.trim() || requestId.length > 200) {
    throw fail("VERSION_CONFLICT", "requestId no válido", 400);
  }
}

export function normalizeSaasReconciliationReason(reason: string): string {
  const normalized = reason.normalize("NFC").trim();
  const characterCount = Array.from(normalized).length;
  if (characterCount < 20 || characterCount > 1000) {
    throw fail("VERSION_CONFLICT", "El motivo debe tener entre 20 y 1000 caracteres", 400);
  }
  return normalized;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function validateConfirmationInput(input: ConfirmSaasReconciliationInput): string {
  assertUuid(input.eventId, "eventId");
  assertUuid(input.actorUserId, "actorUserId");
  validateRequestId(input.requestId);
  if (
    input.idempotencyKey.trim().length < 8 ||
    input.idempotencyKey.trim().length > 150
  ) {
    throw fail("VERSION_CONFLICT", "La clave del envío no es válida", 400);
  }
  return normalizeSaasReconciliationReason(input.reason);
}
