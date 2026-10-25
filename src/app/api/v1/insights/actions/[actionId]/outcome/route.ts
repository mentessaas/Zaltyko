import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveInsightApiScope } from "@/app/api/v1/insights/api-scope";
import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { completeInsightAction } from "@/modules/insights/application/insight-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  outcome: z.enum(["positive", "neutral", "negative", "not_measurable"]),
  afterValue: z.record(z.string(), z.unknown()),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(150),
});

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified session before request validation; the service rechecks membership and scope before recording outcome.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para registrar el resultado.",
      type: "authentication-required",
    });
  }
  const payload = await request.json().catch(() => null);
  const parsedParams = z
    .object({ actionId: z.guid() })
    .safeParse(await params);
  const parsed = bodySchema.safeParse({
    ...(payload && typeof payload === "object" ? payload : {}),
    idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
  });
  if (!parsedParams.success || !parsed.success) {
    return problemResponse({
      status: 400,
      title: "Resultado inválido",
      detail: "Idempotency-Key, outcome y valor posterior son obligatorios.",
      type: "invalid-insight-outcome",
      errors: parsed.success ? undefined : parsed.error.flatten(),
    });
  }
  try {
    const api = await resolveInsightApiScope({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      locationId: parsed.data.locationId,
    });
    const action = await completeInsightAction({
      ...parsed.data,
      organizationId: api.scope.organization.id,
      authorizationLocationId: api.authorizationLocationId,
      actionId: parsedParams.data.actionId,
      actor: api.actor,
    });
    return NextResponse.json(action);
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
