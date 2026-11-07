import { apiCreated, apiSuccess } from "@/lib/api-response";
import {
  createOwnerStaffProfile,
  listOwnerStaffProfiles,
} from "@/modules/staff/application/owner-staff-profiles";
import {
  createOwnerStaffProfileSchema,
  listOwnerStaffProfilesSchema,
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

// @auth-flexible route-guard-reason: getCurrentUser authenticates the request, resolveOwnerScope restricts this directory to an active Owner with all-site scope, and the transactional service repeats organization membership authorization.
export async function GET(request: Request) {
  const user = await getStaffRouteUser(request);
  if (!user) return unauthenticatedResponse();

  const parsed = listOwnerStaffProfilesSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return invalidStaffInput("Selecciona una organización y filtros válidos.", parsed.error.flatten());
  }

  try {
    const scope = await requireOwnerAllScope(user.id, parsed.data.organizationId);
    const limited = await limitStaffRoute(request, scope.organization.id);
    if (limited) return limited;
    const data = await listOwnerStaffProfiles({
      ...parsed.data,
      organizationId: scope.organization.id,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return noStore(apiSuccess(data));
  } catch (error) {
    const response = handleStaffRouteError(error);
    if (response) return response;
    throw error;
  }
}

// @auth-flexible route-guard-reason: getCurrentUser authenticates the request, resolveOwnerScope restricts the command to an active Owner with all-site scope, and the transactional service rechecks access and organization writability before creating rows.
export async function POST(request: Request) {
  const user = await getStaffRouteUser(request);
  if (!user) return unauthenticatedResponse();

  const body = await request.json().catch(() => null);
  const parsedBody = createOwnerStaffProfileSchema.safeParse(body);
  const idempotencyKey = staffProfileIdempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsedBody.success || !idempotencyKey.success) {
    return invalidStaffInput("Indica nombre y apellidos y una clave de idempotencia válida.", {
      ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
      ...(idempotencyKey.success ? {} : { idempotencyKey: "La clave no es válida." }),
    });
  }

  try {
    const scope = await requireOwnerAllScope(user.id, parsedBody.data.organizationId);
    const limited = await limitStaffRoute(request, scope.organization.id);
    if (limited) return limited;
    const result = await createOwnerStaffProfile({
      ...parsedBody.data,
      organizationId: scope.organization.id,
      actor: { userId: user.id, memberId: scope.member.id },
      idempotencyKey: idempotencyKey.data,
    });
    return noStore(result.replayed ? apiSuccess(result) : apiCreated(result));
  } catch (error) {
    const response = handleStaffRouteError(error);
    if (response) return response;
    throw error;
  }
}
