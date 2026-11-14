import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { apiSuccess } from "@/lib/api-response";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { previewPaymentReminders, selectionSchema } from "@/modules/payment-reminders/application/service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

import {
  invalidRequestResponse,
  reminderErrorResponse,
  sameOriginProblem,
  unauthenticatedResponse,
  withPrivateNoStore,
} from "../http";

const bodySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid().optional(),
    selection: selectionSchema,
    // Cambios sin guardar de la plantilla, para ver el efecto antes de guardarlos.
    draft: z
      .object({
        subject: z.string().max(400).nullable().optional(),
        body: z.string().max(8000).nullable().optional(),
        paymentInstructions: z.string().max(2000).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// @auth-flexible route-guard-reason: verifies the session first, derives the actor from active greenfield membership, then performs role/site authorization in the canonical reminder service. The preview reserves and sends nothing.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse(parsed.error.flatten());

  try {
    const scope = await resolveOwnerScope({ userId: user.id, organizationId: parsed.data.organizationId });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const preview = await previewPaymentReminders({ userId: user.id, ...parsed.data });
    return withPrivateNoStore(apiSuccess(preview));
  } catch (error) {
    const response = reminderErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
