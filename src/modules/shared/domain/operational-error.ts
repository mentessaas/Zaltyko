export type OperationalErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LOCATION_SCOPE_DENIED"
  | "INVALID_STATE_TRANSITION"
  | "VERSION_CONFLICT"
  | "CAPACITY_FULL"
  | "DUPLICATE_OPEN_ENROLLMENT"
  | "INVALID_DATE_RANGE"
  | "INVALID_RELATION"
  | "NO_SCHEDULE";

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
