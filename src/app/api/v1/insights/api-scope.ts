import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export async function resolveInsightApiScope(input: {
  userId: string;
  organizationId?: string;
  locationId?: string;
}) {
  const scope = await resolveOwnerScope(input);
  const authorizationLocationId =
    scope.selectedLocationId ?? scope.locations[0]?.id;
  if (!authorizationLocationId) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "La organización no tiene una sede autorizable",
      403
    );
  }
  return {
    scope,
    authorizationLocationId,
    actor: { userId: input.userId, memberId: scope.member.id },
  };
}
