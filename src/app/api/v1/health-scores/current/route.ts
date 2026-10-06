import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOwnerDashboard, ownerDashboardQuerySchema } from "@/modules/owner-dashboard/application/get-owner-dashboard";
import { OperationalError } from "@/modules/shared/domain/operational-error";

// @auth-flexible route-guard-reason: getCurrentUser verifies the session; getOwnerDashboard enforces organization and location scope server-side.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para consultar el Academy Health Score.",
      type: "authentication-required",
    });
  }
  const url = new URL(request.url);
  const parsed = ownerDashboardQuerySchema.safeParse({
    organizationId: url.searchParams.get("organization_id") ?? undefined,
    locationId: url.searchParams.get("location_id") || undefined,
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Parámetros inválidos",
      detail: "Revisa los identificadores solicitados.",
      type: "invalid-health-score-query",
      errors: parsed.error.flatten(),
    });
  }
  try {
    const dashboard = await getOwnerDashboard({ userId: user.id, ...parsed.data });
    const score = dashboard.score;
    return NextResponse.json({
      organization: dashboard.organization,
      scope: dashboard.scope,
      state: dashboard.state,
      score,
      dimensions: dashboard.dimensions,
      freshness: score
        ? {
            computedAt: score.computedAt,
            sourceWatermark: score.sourceWatermark,
            stale: dashboard.state === "stale",
          }
        : null,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
