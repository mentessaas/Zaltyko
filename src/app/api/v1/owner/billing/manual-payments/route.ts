import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import { getManualPaymentOptions } from "@/modules/billing/application/manual-payments";
import { recordManualPaymentForCharge } from "@/modules/billing/application/ledger-service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
});

const paymentBodySchema = z
  .object({
    organizationId: z.guid(),
    chargeId: z.guid(),
    amountCents: z.number().int().positive().safe(),
    method: z.enum(["cash", "bank_transfer", "card_terminal", "other"]),
    reference: z.string().trim().min(1).max(200).optional(),
    receivedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const idempotencyKeySchema = z.string().trim().min(8).max(150);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para consultar o registrar pagos.",
    type: "authentication-required",
  });
}

function requireFinancialRole(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la propiedad o administración puede registrar pagos",
      403
    );
  }
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: the greenfield organization membership is the tenant boundary; the legacy withTenant wrapper resolves academy/profile IDs and would bind this route to the retired model. Owner role, organization, site and financial access are verified in the canonical services.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Filtro inválido",
      detail: "Selecciona una academia y sede válidas.",
      type: "invalid-manual-payment-filter",
      errors: query.error.flatten(),
    });
  }

  try {
    const options = await getManualPaymentOptions({
      userId: user.id,
      ...query.data,
    });
    return withPrivateNoStore(apiSuccess(options));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: verifies the session first, derives the actor from active greenfield membership, then performs role/site authorization and the ledger write in one transaction.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const body = await request.json().catch(() => null);
  const parsedBody = paymentBodySchema.safeParse(body);
  const parsedIdempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsedBody.success || !parsedIdempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Datos del pago incompletos",
      detail:
        "Comprueba el cargo, el importe, el método, la fecha y la clave de envío.",
      type: "invalid-manual-payment",
      errors: {
        ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
        ...(parsedIdempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 150 caracteres." }),
      },
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: parsedBody.data.organizationId,
    });
    requireFinancialRole(scope.member.role);

    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const result = await recordManualPaymentForCharge({
      organizationId: scope.organization.id,
      chargeId: parsedBody.data.chargeId,
      amountCents: parsedBody.data.amountCents,
      method: parsedBody.data.method,
      reference: parsedBody.data.reference,
      receivedAt: parsedBody.data.receivedAt,
      idempotencyKey: parsedIdempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    const response = apiCreated({
      paymentId: result.payment.id,
      allocationId: result.allocation.id,
      chargeId: result.allocation.chargeId,
      amountCents: result.payment.amountCents,
      currency: result.payment.currency,
      receivedAt: result.payment.receivedAt,
      method: result.payment.manualMethod,
    });
    return withPrivateNoStore(response);
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
