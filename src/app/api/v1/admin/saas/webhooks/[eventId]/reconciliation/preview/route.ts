import { randomUUID } from "node:crypto";
import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { authenticateSuperAdminOperator } from "@/lib/authz/super-admin-operator";
import { previewSaasReconciliation } from "@/modules/saas-billing/application/reconciliation-service";
import {
  apiErrorNoStore,
  enforceOperatorRateLimit,
  noStore,
  serviceErrorResponse,
} from "../route-utils";

export const dynamic = "force-dynamic";

const eventIdSchema = z.string().uuid();
const emptyBodySchema = z.object({}).strict();

type RouteContext = { params: Promise<{ eventId: string }> };

async function parseEmptyBody(request: Request): Promise<boolean> {
  const raw = await request.text();
  if (raw.trim() === "") return true;

  try {
    return emptyBodySchema.safeParse(JSON.parse(raw)).success;
  } catch {
    return false;
  }
}

/** @route-auth super-admin-operator — requires a fresh human Supabase session. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateSuperAdminOperator(request);
  if (!auth.ok) return noStore(auth.response);

  const rateLimitResponse = await enforceOperatorRateLimit(auth.actorUserId, "preview");
  if (rateLimitResponse) return rateLimitResponse;

  const { eventId } = await context.params;
  const parsedEventId = eventIdSchema.safeParse(eventId);
  if (!parsedEventId.success) {
    return apiErrorNoStore("VALIDATION_ERROR", "El identificador del evento no es válido.", 400);
  }
  if (!(await parseEmptyBody(request))) {
    return apiErrorNoStore("VALIDATION_ERROR", "La vista previa no acepta datos en el cuerpo.", 400);
  }

  try {
    const result = await previewSaasReconciliation({
      eventId: parsedEventId.data,
      actorUserId: auth.actorUserId,
      requestId: randomUUID(),
    });
    return noStore(apiSuccess(result));
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
