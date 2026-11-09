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
import { createOwnerSaasPortal } from "@/modules/saas-billing/application/saas-billing-service";
import {
  hasSameOrigin,
  resolveSaasOwnerScope,
} from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { saasHttpErrorCode } from "@/modules/saas-billing/application/http-error";

const bodySchema = z.object({ organizationId: z.string().uuid() }).strict();
const idempotencySchema = z.string().trim().min(8).max(150);

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: cookie mutations require same-origin; portal customer and return URL are resolved server-side.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user)
    return noStore(
      apiError("UNAUTHENTICATED", "Inicia sesión para continuar.", 401)
    );
  if (!hasSameOrigin(request)) {
    return noStore(
      apiError("FORBIDDEN", "Origen de la solicitud no válido.", 403)
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  const idempotencyKey = idempotencySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsed.success || !idempotencyKey.success) {
    return noStore(
      apiError("VALIDATION_ERROR", "La solicitud del Portal no es válida.", 400)
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
        await createOwnerSaasPortal({
          organizationId: scope.organizationId,
          idempotencyKey: idempotencyKey.data,
          userId: user.id,
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
        "BILLING_PROVIDER_UNAVAILABLE",
        "No se pudo abrir el Portal.",
        503
      )
    );
  }
}
