export type OperationalErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LOCATION_SCOPE_DENIED"
  | "INVALID_STATE_TRANSITION"
  | "VERSION_CONFLICT"
  | "CAPACITY_FULL"
  | "DUPLICATE_OPEN_ENROLLMENT"
  | "GROUP_CAPACITY_FULL"
  | "DUPLICATE_OPEN_GROUP_MEMBERSHIP"
  | "DUPLICATE_OPEN_WAITLIST"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_DATE_RANGE"
  | "INVALID_RELATION"
  | "NO_SCHEDULE"
  | "INSUFFICIENT_UNALLOCATED_PAYMENT"
  | "CHARGE_ALREADY_SETTLED"
  | "REFUND_EXCEEDS_ALLOCATION"
  | "UNVERIFIED_PROVIDER_EVENT"
  | "FEATURE_NOT_AVAILABLE";

export class OperationalError extends Error {
  constructor(
    public readonly code: OperationalErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "OperationalError";
  }
}
