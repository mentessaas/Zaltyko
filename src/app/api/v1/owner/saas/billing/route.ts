import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { getOwnerSaasBillingSnapshot } from "@/modules/saas-billing/application/saas-billing-service";
import { resolveSaasOwnerScope } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { saasHttpErrorCode } from "@/modules/saas-billing/application/http-error";

const querySchema = z.object({ organizationId: z.string().uuid() }).strict();

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: authentication precedes strict query parsing; direct active Owner membership is resolved server-side.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return noStore(
      apiError("UNAUTHENTICATED", "Inicia sesión para continuar.", 401)
    );
  }

  const url = new URL(request.url);
  const organizationIds = url.searchParams.getAll("organizationId");
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success || organizationIds.length !== 1) {
    return noStore(
      apiError("VALIDATION_ERROR", "Indica una organización válida.", 400)
    );
  }

  try {
    const scope = await resolveSaasOwnerScope({
      userId: user.id,
      organizationId: parsed.data.organizationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organizationId
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    return noStore(
      apiSuccess(
        await getOwnerSaasBillingSnapshot({
          userId: user.id,
          organizationId: scope.organizationId,
        })
      )
    );
  } catch (error) {
    if (error instanceof OperationalError) {
      return noStore(
        apiError(
          saasHttpErrorCode(error),
          error.message,
          error.status,
          error.details
        )
      );
    }
    return noStore(
      apiError(
        "BILLING_SCHEMA_UNAVAILABLE",
        "La facturación SaaS no está disponible en este momento.",
        503
      )
    );
  }
}
