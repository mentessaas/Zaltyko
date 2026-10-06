import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getHealthScoreHistory,
  healthScoreHistoryQuerySchema,
} from "@/modules/owner-dashboard/application/health-score-history";
import { OperationalError } from "@/modules/shared/domain/operational-error";

// @auth-flexible route-guard-reason: getCurrentUser verifies the session; history query applies the member and location scope before reading snapshots.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para consultar el historial del score.",
      type: "authentication-required",
    });
  }
  const url = new URL(request.url);
  const parsed = healthScoreHistoryQuerySchema.safeParse({
    organizationId: url.searchParams.get("organization_id") ?? undefined,
    locationId: url.searchParams.get("location_id") || undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Parámetros inválidos",
      detail: "Revisa el scope, el límite y el cursor.",
      type: "invalid-health-score-history-query",
      errors: parsed.error.flatten(),
    });
  }
  try {
    const history = await getHealthScoreHistory({ userId: user.id, ...parsed.data });
    return NextResponse.json(history, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
