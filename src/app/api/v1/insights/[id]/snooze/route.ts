import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveInsightApiScope } from "@/app/api/v1/insights/api-scope";
import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { changeInsightDisposition } from "@/modules/insights/application/insight-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  expectedVersion: z.number().int().positive(),
  snoozedUntil: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().trim().min(8).max(150),
});

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified session before request validation; the service rechecks membership, scope and optimistic version.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para posponer el insight.",
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
      title: "Snooze inválido",
      detail: "Idempotency-Key, versión y fecha futura son obligatorios.",
      type: "invalid-insight-snooze",
      errors: parsed.success ? undefined : parsed.error.flatten(),
    });
  }
  try {
    const api = await resolveInsightApiScope({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      locationId: parsed.data.locationId,
    });
    const insight = await changeInsightDisposition({
      transition: "snooze",
      ...parsed.data,
      organizationId: api.scope.organization.id,
      authorizationLocationId: api.authorizationLocationId,
      insightId: parsedParams.data.id,
      actor: api.actor,
    });
    return NextResponse.json(insight);
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
