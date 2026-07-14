export const dynamic = "force-dynamic";

import type { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { sendManualPaymentReminder } from "@/lib/email/triggers";

const REMINDER_ERROR_MESSAGES: Record<string, { code: string; message: string; status: number }> = {
  CHARGE_NOT_FOUND: { code: "CHARGE_NOT_FOUND", message: "Cargo no encontrado", status: 404 },
  CHARGE_ALREADY_SETTLED: {
    code: "CHARGE_ALREADY_SETTLED",
    message: "Este cargo ya no está pendiente ni atrasado",
    status: 409,
  },
  NO_CONTACT_EMAIL: {
    code: "NO_CONTACT_EMAIL",
    message: "El gimnasta no tiene un email de familia registrado",
    status: 409,
  },
};

const remindHandler = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const pathMatch = url.pathname.match(/^\/api\/charges\/([^/]+)\/remind/);
    const chargeId = pathMatch?.[1];

    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Charge ID is required", 400);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const result = await sendManualPaymentReminder({ chargeId, tenantId: context.tenantId });

    if (!result.ok) {
      const known = REMINDER_ERROR_MESSAGES[result.reason];
      return apiError(known.code, known.message, known.status);
    }

    return apiSuccess({ sentTo: result.sentTo });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/charges/[chargeId]/remind", method: "POST" });
  }
});

export const POST = withRateLimit(
  async (request, context) => (await remindHandler(request, context ?? {})) as NextResponse,
  { identifier: getUserIdentifier, limit: 5, window: 60 }
);
