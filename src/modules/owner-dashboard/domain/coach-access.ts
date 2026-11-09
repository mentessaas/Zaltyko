import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Coach access to the Owner workspace (P1 #8).
 *
 * A coach may only use "Hoy" (today's sessions) and "Pasar lista" for the
 * sites in their scope. Everything else (finances, staff, plan, export,
 * settings, organization aggregate) stays denied server-side because
 * resolveOwnerScope only admits coaches when a caller explicitly asks for the
 * coach operations surface (see OwnerScopeSurface).
 */
export const COACH_WITHOUT_LOCATIONS_REASON = "coach_without_locations";

export const COACH_HOME_PATH = "/owner/attendance";

/**
 * Coaches read the operational policy only for its read-only flag; the plan
 * itself is commercial data and is replaced by this non-plan marker.
 */
export const COACH_MASKED_PLAN_CODE = "staff";

export function isCoachRole(role: string | null | undefined): boolean {
  return role === "coach";
}

/** Organization id carried by a "coach without sites" denial, if any. */
export function coachWithoutLocationsOrganizationId(
  error: unknown
): string | null {
  if (
    !(error instanceof OperationalError) ||
    error.code !== "LOCATION_SCOPE_DENIED" ||
    error.details?.reason !== COACH_WITHOUT_LOCATIONS_REASON
  ) {
    return null;
  }
  const organizationId = error.details.organizationId;
  return typeof organizationId === "string" ? organizationId : null;
}

export function coachHomeHref(input: {
  organizationId: string;
  locationId?: string | null;
}): string {
  const params = new URLSearchParams({ organizationId: input.organizationId });
  if (input.locationId) params.set("locationId", input.locationId);
  return `${COACH_HOME_PATH}?${params.toString()}`;
}
