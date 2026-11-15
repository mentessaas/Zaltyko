import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { apiSuccess } from "@/lib/api-response";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import {
  getPaymentReminderOverview,
  selectionSchema,
  sendPaymentReminders,
} from "@/modules/payment-reminders/application/service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

import {
  invalidRequestResponse,
  reminderErrorResponse,
  sameOriginProblem,
  unauthenticatedResponse,
  withPrivateNoStore,
} from "./http";

const querySchema = z.object({
  organizationId: z.guid(),
  locationId: z.guid().optional(),
});

const sendBodySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid().optional(),
    selection: selectionSchema,
  })
  .strict();

// @auth-flexible route-guard-reason: the greenfield organization membership is the tenant boundary; the legacy withTenant wrapper resolves academy/profile IDs and would bind this route to the retired model. Owner role, organization, site and financial access are verified in the canonical reminder service.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.success) return invalidRequestResponse(query.error.flatten());

  try {
    const overview = await getPaymentReminderOverview({ userId: user.id, ...query.data });
    return withPrivateNoStore(apiSuccess(overview));
  } catch (error) {
    const response = reminderErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

// @auth-flexible route-guard-reason: verifies the session first, derives the actor from active greenfield membership, then performs role/site authorization, the per-charge reminder limit and the send in the canonical reminder service.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const body = await request.json().catch(() => null);
  const parsed = sendBodySchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse(parsed.error.flatten());

  try {
    const scope = await resolveOwnerScope({ userId: user.id, organizationId: parsed.data.organizationId });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const result = await sendPaymentReminders({ userId: user.id, ...parsed.data });
    return withPrivateNoStore(apiSuccess(result));
  } catch (error) {
    const response = reminderErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
