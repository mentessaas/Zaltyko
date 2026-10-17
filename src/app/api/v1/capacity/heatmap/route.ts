import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { capacityHeatmapQuerySchema, getCapacityHeatmap } from "@/modules/owner-dashboard/application/capacity-heatmap";
import { OperationalError } from "@/modules/shared/domain/operational-error";

// @auth-flexible route-guard-reason: getCurrentUser verifies the session; getCapacityHeatmap authorizes organization/location scope before reading operational data.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para consultar la ocupación.",
      type: "authentication-required",
    });
  }
  const url = new URL(request.url);
  const parsed = capacityHeatmapQuerySchema.safeParse({
    organizationId: url.searchParams.get("organization_id") ?? undefined,
    locationId: url.searchParams.get("location_id") || undefined,
    programId: url.searchParams.get("program_id") || undefined,
    groupId: url.searchParams.get("group_id") || undefined,
    asOf: url.searchParams.get("as_of") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Parámetros inválidos",
      detail: "Revisa la sede, programa, grupo, fecha y cursor.",
      type: "invalid-capacity-heatmap-query",
      errors: parsed.error.flatten(),
    });
  }
  try {
    const heatmap = await getCapacityHeatmap({ userId: user.id, ...parsed.data });
    return NextResponse.json(heatmap, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
