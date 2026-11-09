import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getLimitForRoute, getVerifiedTenantRateLimitIdentifier, rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const query = z.object({ organizationId: z.string().uuid(), locationId: z.string().uuid().optional() }).strict();

// @auth-flexible route-guard-reason: canonical active Owner-surface membership and selected-site scope are verified before reading the minimal operational policy; no commercial data or mutations are exposed.
export async function GET(request: Request) {
  const response = await readPolicy(request);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

async function readPolicy(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return apiError("UNAUTHENTICATED", "Inicia sesión para continuar", 401);
  const params = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) return apiError("VALIDATION_ERROR", "Solicitud no válida", 400);
  try {
    const scope = await resolveOwnerScope({ userId: user.id, ...params.data });
    const limit = await rateLimit({ identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id), ...getLimitForRoute(new URL(request.url).pathname) });
    if (!limit.success) return rateLimitExceededResponse(limit);
    const policy = await db.transaction(async tx => {
      await tx.execute(sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"));
      const usage = await getOrganizationUsage(tx, scope.organization.id);
      // Organization-wide enforcement remains authoritative, without revealing
      // counts, resource names, subscription IDs or commercial permissions.
      return { readOnly: usage.readOnly, planCode: usage.planCode };
    });
    return apiSuccess(policy);
  } catch (error) {
    if (error instanceof OperationalError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
