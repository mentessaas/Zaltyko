import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRetentionCohorts, retentionCohortsQuerySchema } from "@/modules/owner-dashboard/application/retention-cohorts";
import { OperationalError } from "@/modules/shared/domain/operational-error";

// @auth-flexible route-guard-reason: getCurrentUser verifies the session; getRetentionCohorts authorizes organization/location scope before reading enrollment history.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para consultar las cohortes.",
      type: "authentication-required",
    });
  }
  const url = new URL(request.url);
  const parsed = retentionCohortsQuerySchema.safeParse({
    organizationId: url.searchParams.get("organization_id") ?? undefined,
    locationId: url.searchParams.get("location_id") || undefined,
    programId: url.searchParams.get("program_id") || undefined,
    groupId: url.searchParams.get("group_id") || undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    asOf: url.searchParams.get("as_of") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Parámetros inválidos",
      detail: "Revisa el scope, período, fecha de corte y cursor.",
      type: "invalid-retention-cohort-query",
      errors: parsed.error.flatten(),
    });
  }
  try {
    const cohorts = await getRetentionCohorts({ userId: user.id, ...parsed.data });
    return NextResponse.json(cohorts, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
