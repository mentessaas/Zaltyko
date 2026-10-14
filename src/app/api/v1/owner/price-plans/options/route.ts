import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { db } from "@/db";
import {
  classTemplates,
  pricePlans,
  pricePlanClassTemplateCoverage,
} from "@/db/zaltyko-schema";
import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
  })
  .strict();

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: getCurrentUser authenticates before query parsing; resolveOwnerScope and the service enforce organization and site membership.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para consultar las tarifas.",
      type: "authentication-required",
    });
  }
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Selecciona una sede",
      detail: "La academia y la sede son obligatorias.",
      type: "invalid-price-plan-options-query",
      errors: query.error.flatten(),
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);
    const options = await db.transaction(async (tx) => {
      await assertOperationalAccess(tx, {
        ...query.data,
        actor: { userId: user.id, memberId: scope.member.id },
        allowedRoles: ["owner", "admin", "manager"],
      });
      const plans = await tx
        .select({
          id: pricePlans.id,
          name: pricePlans.name,
          amountCents: pricePlans.amountCents,
          currency: pricePlans.currency,
          cadence: pricePlans.cadence,
        })
        .from(pricePlans)
        .where(
          and(
            eq(pricePlans.organizationId, scope.organization.id),
            eq(pricePlans.isActive, true),
            eq(pricePlans.cadence, "monthly"),
            sql`exists (
              select 1 from ${pricePlanClassTemplateCoverage}
              where ${pricePlanClassTemplateCoverage.organizationId} = ${pricePlans.organizationId}
                and ${pricePlanClassTemplateCoverage.pricePlanId} = ${pricePlans.id}
                and ${pricePlanClassTemplateCoverage.locationId} = ${query.data.locationId}::uuid
            )`
          )
        )
        .orderBy(asc(pricePlans.name))
        .limit(100);
      const classes = await tx
        .select({
          id: classTemplates.id,
          name: classTemplates.name,
          effectiveFrom: classTemplates.effectiveFrom,
          effectiveTo: classTemplates.effectiveTo,
        })
        .from(classTemplates)
        .where(
          and(
            eq(classTemplates.organizationId, scope.organization.id),
            eq(classTemplates.locationId, query.data.locationId),
            eq(classTemplates.status, "active")
          )
        )
        .orderBy(asc(classTemplates.name), asc(classTemplates.id))
        .limit(101);
      return {
        organizationId: scope.organization.id,
        locationId: query.data.locationId,
        items: plans,
        classTemplates: classes.slice(0, 100),
        classTemplatesHasMore: classes.length > 100,
      };
    });
    return noStore(apiSuccess(options));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
