import type { OperationalError } from "@/modules/shared/domain/operational-error";

const publicDetailCodes = new Set([
  "CHECKOUT_IN_PROGRESS",
  "CHECKOUT_EXPIRED",
  "SUBSCRIPTION_ALREADY_EXISTS",
  "TRIAL_NOT_ELIGIBLE",
  "BILLING_CONFIGURATION_UNAVAILABLE",
  "BILLING_PROVIDER_UNAVAILABLE",
  "BILLING_SCHEMA_UNAVAILABLE",
]);

/** Keep internal operational categories out of the commercial UI contract. */
export function saasHttpErrorCode(error: OperationalError): string {
  if (error.code === "NOT_FOUND") return "ORGANIZATION_NOT_FOUND";
  const detailCode = error.details?.code;
  if (typeof detailCode === "string" && publicDetailCodes.has(detailCode)) {
    return detailCode;
  }
  return error.code;
}
