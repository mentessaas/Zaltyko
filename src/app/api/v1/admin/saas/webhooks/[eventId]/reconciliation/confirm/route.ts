import { randomUUID } from "node:crypto";
import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { authenticateSuperAdminOperator } from "@/lib/authz/super-admin-operator";
import { confirmSaasReconciliation } from "@/modules/saas-billing/application/reconciliation-service";
import {
  apiErrorNoStore,
  enforceOperatorRateLimit,
  noStore,
  serviceErrorResponse,
} from "../route-utils";

export const dynamic = "force-dynamic";

const eventIdSchema = z.string().uuid();
const confirmationBodySchema = z
  .object({
    // The signed claims include the full entitlement baseline; allow room for
    // long provider references while keeping the opaque token bounded.
    previewToken: z.string().trim().min(1).max(16_384),
    reason: z.string().trim().min(20).max(1000),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(150);

type RouteContext = { params: Promise<{ eventId: string }> };

/** @route-auth super-admin-operator — requires a fresh human Supabase session. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateSuperAdminOperator(request);
  if (!auth.ok) return noStore(auth.response);

  const rateLimitResponse = await enforceOperatorRateLimit(auth.actorUserId, "confirm");
  if (rateLimitResponse) return rateLimitResponse;

  const { eventId } = await context.params;
  const parsedEventId = eventIdSchema.safeParse(eventId);
  if (!parsedEventId.success) {
    return apiErrorNoStore("VALIDATION_ERROR", "El identificador del evento no es válido.", 400);
  }

  const body = await request.json().catch(() => null);
  const parsedBody = confirmationBodySchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsedBody.success || !idempotencyKey.success) {
    return apiErrorNoStore(
      "VALIDATION_ERROR",
      "La confirmación, el motivo o la clave de idempotencia no son válidos.",
      400
    );
  }

  try {
    const result = await confirmSaasReconciliation({
      eventId: parsedEventId.data,
      actorUserId: auth.actorUserId,
      requestId: randomUUID(),
      previewToken: parsedBody.data.previewToken,
      reason: parsedBody.data.reason,
      idempotencyKey: idempotencyKey.data,
    });
    return noStore(apiSuccess(result));
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
