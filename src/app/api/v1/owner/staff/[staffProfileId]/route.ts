import { apiSuccess } from "@/lib/api-response";
import {
  updateOwnerStaffProfile,
} from "@/modules/staff/application/owner-staff-profiles";
import {
  staffProfileIdSchema,
  staffProfileIdempotencyKeySchema,
  updateOwnerStaffProfileSchema,
} from "@/modules/staff/application/staff-profile-contract";
import {
  getStaffRouteUser,
  handleStaffRouteError,
  invalidStaffInput,
  limitStaffRoute,
  noStore,
  requireOwnerAllScope,
  unauthenticatedResponse,
} from "@/app/api/v1/owner/staff/route-helpers";

type RouteContext = { params: Promise<{ staffProfileId: string }> };

// @auth-flexible route-guard-reason: getCurrentUser authenticates the request, resolveOwnerScope restricts edits to an active Owner with all-site scope, and the transactional service rechecks access, optimistic version and person-link safety.
export async function PATCH(request: Request, context: RouteContext) {
  const user = await getStaffRouteUser(request);
  if (!user) return unauthenticatedResponse();

  const { staffProfileId } = await context.params;
  if (!staffProfileIdSchema.safeParse(staffProfileId).success) {
    return invalidStaffInput("El identificador del perfil no es válido.");
  }
  const body = await request.json().catch(() => null);
  const parsedBody = updateOwnerStaffProfileSchema.safeParse(body);
  const idempotencyKey = staffProfileIdempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsedBody.success || !idempotencyKey.success) {
    return invalidStaffInput("Indica el nombre y los apellidos. Si sigue fallando, recarga la página.", {
      ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
      ...(idempotencyKey.success ? {} : { idempotencyKey: "La clave no es válida." }),
    });
  }

  try {
    const scope = await requireOwnerAllScope(user.id, parsedBody.data.organizationId);
    const limited = await limitStaffRoute(request, scope.organization.id);
    if (limited) return limited;
    const result = await updateOwnerStaffProfile({
      ...parsedBody.data,
      organizationId: scope.organization.id,
      staffProfileId,
      actor: { userId: user.id, memberId: scope.member.id },
      idempotencyKey: idempotencyKey.data,
    });
    return noStore(apiSuccess(result));
  } catch (error) {
    const response = handleStaffRouteError(error);
    if (response) return response;
    throw error;
  }
}
