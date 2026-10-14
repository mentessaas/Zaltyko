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
import { createMonthlyPricePlan } from "@/modules/billing/application/monthly-price-plan-service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    amountCents: z.number().int().safe().positive().max(2_147_483_647),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    coverage: z
      .object({
        classTemplateIds: z
          .array(
            z
              .string()
              .uuid()
              .transform((id) => id.toLowerCase())
          )
          .min(1)
          .max(100),
        startsOn: z.string().date(),
        endsOn: z.string().date().nullable(),
      })
      .strict()
      .superRefine((coverage, context) => {
        if (
          new Set(coverage.classTemplateIds).size !==
          coverage.classTemplateIds.length
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["classTemplateIds"],
            message: "No repitas una plantilla en la cobertura.",
          });
        }
        if (coverage.endsOn && coverage.endsOn < coverage.startsOn) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endsOn"],
            message: "La fecha final no puede ser anterior a la inicial.",
          });
        }
      }),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: authenticate before parsing; owner scope and the transactional service both enforce organization, site, role and idempotency.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para crear la tarifa mensual.",
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
      title: "Tarifa mensual incompleta",
      detail: "Indica un nombre, un importe y una cobertura mensual válidos.",
      type: "invalid-monthly-price-plan-command",
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

    const result = await createMonthlyPricePlan({
      ...parsed.data,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    const payload = {
      id: result.pricePlan.id,
      name: result.pricePlan.name,
      amountCents: result.pricePlan.amountCents,
      currency: result.pricePlan.currency,
      cadence: result.pricePlan.cadence,
      isActive: result.pricePlan.isActive,
      coverage: result.coverage,
    };
    return noStore(result.replayed ? apiSuccess(payload) : apiCreated(payload));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
