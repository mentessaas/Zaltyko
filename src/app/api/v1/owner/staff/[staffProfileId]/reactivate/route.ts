import { apiSuccess } from "@/lib/api-response";
import { reactivateOwnerStaffProfile } from "@/modules/staff/application/owner-staff-profiles";
import {
  staffProfileIdSchema,
  setOwnerStaffProfileActiveSchema,
  staffProfileIdempotencyKeySchema,
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

// @auth-flexible route-guard-reason: getCurrentUser authenticates the request, resolveOwnerScope restricts reactivation to an active Owner with all-site scope, and the transactional service repeats authorization and version checks before toggling is_active.
export async function POST(request: Request, context: RouteContext) {
  const user = await getStaffRouteUser(request);
  if (!user) return unauthenticatedResponse();

  const { staffProfileId } = await context.params;
  if (!staffProfileIdSchema.safeParse(staffProfileId).success) {
    return invalidStaffInput("El identificador del perfil no es válido.");
  }
  const body = await request.json().catch(() => null);
  const parsedBody = setOwnerStaffProfileActiveSchema.safeParse(body);
  const idempotencyKey = staffProfileIdempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsedBody.success || !idempotencyKey.success) {
    return invalidStaffInput("Indica la versión actual y una clave de idempotencia válida.", {
      ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
      ...(idempotencyKey.success ? {} : { idempotencyKey: "La clave no es válida." }),
    });
  }

  try {
    const scope = await requireOwnerAllScope(user.id, parsedBody.data.organizationId);
    const limited = await limitStaffRoute(request, scope.organization.id);
    if (limited) return limited;
    const result = await reactivateOwnerStaffProfile({
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
