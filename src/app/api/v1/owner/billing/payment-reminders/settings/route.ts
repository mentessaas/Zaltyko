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
  getPaymentReminderSettings,
  settingsInputSchema,
  updatePaymentReminderSettings,
} from "@/modules/payment-reminders/application/settings";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

import {
  invalidRequestResponse,
  reminderErrorResponse,
  sameOriginProblem,
  unauthenticatedResponse,
  withPrivateNoStore,
} from "../http";

const querySchema = z.object({ organizationId: z.guid() });
const putBodySchema = z
  .object({ organizationId: z.guid(), settings: settingsInputSchema })
  .strict();

// @auth-flexible route-guard-reason: the greenfield organization membership is the tenant boundary; owner or admin role is verified in the canonical reminder settings service.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.success) return invalidRequestResponse(query.error.flatten());

  try {
    const settings = await getPaymentReminderSettings({ userId: user.id, organizationId: query.data.organizationId });
    return withPrivateNoStore(apiSuccess(settings));
  } catch (error) {
    const response = reminderErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

// @auth-flexible route-guard-reason: verifies the session first, then owner/admin role and organization-wide site access in the canonical reminder settings service before writing.
export async function PUT(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const body = await request.json().catch(() => null);
  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse(parsed.error.flatten());

  try {
    const scope = await resolveOwnerScope({ userId: user.id, organizationId: parsed.data.organizationId });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const settings = await updatePaymentReminderSettings({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      settings: parsed.data.settings,
    });
    return withPrivateNoStore(apiSuccess(settings));
  } catch (error) {
    const response = reminderErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
