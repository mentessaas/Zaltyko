/**
 * fail(): the OperationalError of the reconciliation, with its public code
 * (EVENT_NOT_FOUND, STATE_CHANGED, RECONCILIATION_NOT_ALLOWED,
 * IDEMPOTENCY_KEY_REUSED, PROVIDER_UNAVAILABLE, UNSUPPORTED_QUARANTINE...).
 */
import { OperationalError } from "@/modules/shared/domain/operational-error";

export function fail(
  code: ConstructorParameters<typeof OperationalError>[0],
  message: string,
  status: number,
  publicCode?: string
): OperationalError {
  const mappedCode =
    publicCode ??
    (code === "NOT_FOUND"
      ? "EVENT_NOT_FOUND"
      : code === "VERSION_CONFLICT" && status === 409
        ? "STATE_CHANGED"
        : code === "INVALID_STATE_TRANSITION"
          ? "RECONCILIATION_NOT_ALLOWED"
          : code === "IDEMPOTENCY_CONFLICT"
            ? "IDEMPOTENCY_KEY_REUSED"
            : code === "UNVERIFIED_PROVIDER_EVENT"
              ? "PROVIDER_UNAVAILABLE"
              : code === "PRICE_PLAN_NOT_AVAILABLE"
                ? "UNSUPPORTED_QUARANTINE"
                : undefined);
  return new OperationalError(
    code,
    message,
    status,
    mappedCode ? { code: mappedCode } : undefined
  );
}
