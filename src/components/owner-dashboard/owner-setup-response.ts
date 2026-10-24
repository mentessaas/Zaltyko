const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OwnerSetupReceipt = {
  organizationId: string;
  locationId: string;
  memberId: string;
};

/** A successful HTTP status alone is not proof that bootstrap returned its receipt. */
export function parseOwnerSetupReceipt(
  value: unknown
): OwnerSetupReceipt | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const organizationId = record.organizationId;
  const locationId = record.locationId;
  const memberId = record.memberId;
  if (
    typeof organizationId !== "string" ||
    !UUID_PATTERN.test(organizationId) ||
    typeof locationId !== "string" ||
    !UUID_PATTERN.test(locationId) ||
    typeof memberId !== "string" ||
    !UUID_PATTERN.test(memberId)
  ) {
    return null;
  }

  return { organizationId, locationId, memberId };
}
