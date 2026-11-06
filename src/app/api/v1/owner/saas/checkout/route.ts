import { NextResponse } from "next/server";
import { z } from "zod";

import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { createOwnerSaasCheckout, recoverOwnerSaasCheckout } from "@/modules/saas-billing/application/saas-billing-service";
import {
  hasSameOrigin,
  resolveSaasOwnerScope,
} from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { saasHttpErrorCode } from "@/modules/saas-billing/application/http-error";

const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    planCode: z.enum(["free", "starter", "growth", "network"]),
    billingInterval: z.enum(["month", "year"]),
  })
  .strict();
const idempotencySchema = z.string().trim().min(8).max(150);

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: cookie mutations require same-origin; direct Owner membership and durable transaction both recheck scope.
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
      apiError(
        "VALIDATION_ERROR",
        "La solicitud de Checkout no es válida.",
        400
      )
    );
  }
  if (parsed.data.planCode === "free" || parsed.data.planCode === "network") {
    return noStore(
      apiError(
        "PLAN_NOT_SELF_SERVE",
        "Este plan no se puede contratar desde Checkout.",
        422
      )
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

    const result = await createOwnerSaasCheckout({
      ...parsed.data,
      planCode: parsed.data.planCode,
      idempotencyKey: idempotencyKey.data,
      userId: user.id,
    });
    const data = {
      operationId: result.operationId,
      checkoutUrl: result.checkoutUrl,
      expiresAt: result.expiresAt.toISOString(),
      status: result.status,
    };
    return noStore(result.replayed ? apiSuccess(data) : apiCreated(data));
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
        "No se pudo iniciar Checkout.",
        503
      )
    );
  }
}

// @auth-flexible route-guard-reason: authenticated active Owner only; recovery reads the existing session without mutations.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore(apiError("UNAUTHENTICATED", "Inicia sesión para continuar.", 401));
  const params = new URL(request.url).searchParams;
  const parsed = z.object({ organizationId: z.string().uuid() }).strict()
    .safeParse(Object.fromEntries(params));
  if (!parsed.success || params.getAll("organizationId").length !== 1)
    return noStore(apiError("VALIDATION_ERROR", "Indica una organización válida.", 400));
  try {
    const scope = await resolveSaasOwnerScope({ userId: user.id, organizationId: parsed.data.organizationId });
    const limit = await rateLimit({ identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organizationId),
      ...getLimitForRoute(new URL(request.url).pathname) });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));
    const result = await recoverOwnerSaasCheckout({ userId: user.id, organizationId: scope.organizationId });
    return noStore(apiSuccess(result ? { ...result, expiresAt: result.expiresAt.toISOString() } : null));
  } catch (error) {
    if (error instanceof OperationalError)
      return noStore(apiError(saasHttpErrorCode(error), error.message, error.status, error.details));
    return noStore(apiError("BILLING_PROVIDER_UNAVAILABLE", "No se pudo recuperar la sesión de pago.", 503));
  }
}
