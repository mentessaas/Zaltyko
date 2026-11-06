import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, getLimitForRoute, getVerifiedTenantRateLimitIdentifier, rateLimitExceededResponse } from "@/lib/rate-limit";
import { hasSameOrigin, resolveSaasOwnerScope } from "@/modules/saas-billing/application/owner-access";
import { archiveResource, getRegularizationStatus } from "@/modules/saas-billing/application/regularization-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const resource = z.enum(["athletes", "groups", "classes"]);
const query = z.object({ organizationId: z.string().uuid(), resource: resource.optional(), after: z.string().uuid().optional() }).strict();
const command = z.object({ organizationId: z.string().uuid(), resource, resourceId: z.string().uuid(), confirmArchive: z.literal(true) }).strict();
const key = z.string().trim().min(8).max(150);

async function handle(request: Request, write: boolean) {
  const user = await getCurrentUser(request);
  if (!user) return apiError("UNAUTHENTICATED", "Inicia sesión para continuar", 401);
  if (write && !hasSameOrigin(request)) return apiError("FORBIDDEN", "Origen no válido", 403);
  const params = write ? command.safeParse(await request.json().catch(() => null)) : query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) return apiError("VALIDATION_ERROR", "Solicitud no válida", 400);
  try {
    const scope = await resolveSaasOwnerScope({ userId: user.id, organizationId: params.data.organizationId });
    const limited = await rateLimit({ identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organizationId), ...getLimitForRoute(new URL(request.url).pathname) });
    if (!limited.success) return rateLimitExceededResponse(limited);
    if (!write) return apiSuccess(await getRegularizationStatus({ ...query.parse(params.data), userId: user.id }));
    const idempotency = key.safeParse(request.headers.get("idempotency-key"));
    if (!idempotency.success) return apiError("VALIDATION_ERROR", "Falta una clave de operación válida", 400);
    return apiSuccess(await archiveResource({ ...command.parse(params.data), userId: user.id, idempotencyKey: idempotency.data }));
  } catch (error) {
    if (error instanceof OperationalError) return apiError(error.code, error.message, error.status, error.details);
    throw error;
  }
}

// @auth-flexible route-guard-reason: server session plus direct active Owner membership, repeated inside the transaction; the client never supplies actor, role, count, limit, or plan.
export async function GET(request: Request) { const response = await handle(request, false); response.headers.set("cache-control", "private, no-store"); return response; }
// @auth-flexible route-guard-reason: same-origin, authenticated active Owner, strict archive command and tenant rate limit; only capacity-reducing actions bypass the operational-write guard.
export async function POST(request: Request) { const response = await handle(request, true); response.headers.set("cache-control", "private, no-store"); return response; }
