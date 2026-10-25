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
import {
  hasSameOrigin,
  resolveSaasOwnerScope,
} from "@/modules/saas-billing/application/owner-access";
import { updateOwnerFamilyLifecycle } from "@/modules/families/application/owner-family-management";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    action: z.enum(["archive", "restore"]),
    expectedFamilyVersion: z.string().datetime({ precision: 6 }),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: same-origin, authenticated organization Owner is rechecked inside the transaction; archive/restore only toggles the family soft-delete flag and preserves linked operational and billing records.
export async function POST(
  request: Request,
  context: { params: Promise<{ familyId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return noStore(apiError("UNAUTHENTICATED", "Inicia sesión para continuar", 401));
  }
  if (!hasSameOrigin(request)) {
    return noStore(apiError("FORBIDDEN", "Origen no válido", 403));
  }

  const params = await context.params;
  const familyId = z.string().uuid().safeParse(params.familyId);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!familyId.success || !body.success || !idempotencyKey.success) {
    return noStore(
      apiError("VALIDATION_ERROR", "Solicitud de archivo familiar no válida", 400)
    );
  }

  try {
    const scope = await resolveSaasOwnerScope({
      userId: user.id,
      organizationId: body.data.organizationId,
    });
    const limited = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organizationId
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limited.success) return noStore(rateLimitExceededResponse(limited));

    const result = await updateOwnerFamilyLifecycle({
      ...body.data,
      familyId: familyId.data,
      userId: user.id,
      idempotencyKey: idempotencyKey.data,
    });
    return noStore(apiSuccess(result));
  } catch (error) {
    if (error instanceof OperationalError) {
      return noStore(apiError(error.code, error.message, error.status));
    }
    throw error;
  }
}
