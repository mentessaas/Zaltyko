import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveInsightApiScope } from "@/app/api/v1/insights/api-scope";
import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordInsightAction } from "@/modules/insights/application/insight-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  expectedVersion: z.number().int().positive(),
  actionKey: z.string().trim().min(1).max(80),
  targetEntityType: z.string().trim().min(1).max(80),
  targetEntityId: z.string().uuid().optional(),
  beforeValue: z.record(z.string(), z.unknown()),
  evaluationWindowDays: z.number().int().min(1).max(365),
  idempotencyKey: z.string().trim().min(8).max(150),
});

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified session before request validation; the service rechecks membership, scope, version and CTA relation.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para registrar una acción.",
      type: "authentication-required",
    });
  }
  const payload = await request.json().catch(() => null);
  const parsedParams = z
    .object({ id: z.string().uuid() })
    .safeParse(await params);
  const parsed = bodySchema.safeParse({
    ...(payload && typeof payload === "object" ? payload : {}),
    idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
  });
  if (!parsedParams.success || !parsed.success) {
    return problemResponse({
      status: 400,
      title: "Acción inválida",
      detail: "Idempotency-Key, versión y evidencia previa son obligatorios.",
      type: "invalid-insight-action",
      errors: parsed.success ? undefined : parsed.error.flatten(),
    });
  }
  try {
    const api = await resolveInsightApiScope({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      locationId: parsed.data.locationId,
    });
    const action = await recordInsightAction({
      ...parsed.data,
      organizationId: api.scope.organization.id,
      authorizationLocationId: api.authorizationLocationId,
      insightId: parsedParams.data.id,
      actor: api.actor,
    });
    return NextResponse.json(action, { status: 201 });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
