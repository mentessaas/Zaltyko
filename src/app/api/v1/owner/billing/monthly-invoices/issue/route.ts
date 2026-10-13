import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { issueMonthlyInvoice } from "@/modules/billing/application/monthly-invoice-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    familyId: z.string().uuid(),
    familyPayerId: z.string().uuid(),
    servicePeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    dueDate: z.string().date(),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: getCurrentUser authenticates before JSON parsing; resolveOwnerScope and the billing transaction recheck owner/admin, site and financial access.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para emitir la factura.",
      type: "authentication-required",
    });
  }
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsed.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Factura mensual incompleta",
      detail: "Actualiza la cotización y selecciona una fecha de vencimiento.",
      type: "invalid-monthly-invoice-command",
      errors: {
        ...(parsed.success ? {} : { body: parsed.error.flatten() }),
        ...(idempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
      },
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      locationId: parsed.data.locationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);
    const result = await issueMonthlyInvoice({
      ...parsed.data,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    const payload = {
      invoiceId: result.invoice.id,
      reference: result.invoice.reference,
      status: result.invoice.status,
      chargeStatus: result.chargeStatus,
      collectionMode: result.collectionMode,
      charges: result.charges,
      totalAmountCents: result.invoice.totalAmountCents,
      currency: result.invoice.currency,
      servicePeriod: parsed.data.servicePeriod,
      dueDate: parsed.data.dueDate,
      dueAt: result.invoice.dueAt.toISOString(),
      lines: result.lines.map((line) => ({
        enrollmentId: line.enrollmentId,
        athleteName: line.athleteName,
        amountCents: line.amountCents,
        currency: line.currency,
      })),
    };
    return noStore(result.replayed ? apiSuccess(payload) : apiCreated(payload));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
